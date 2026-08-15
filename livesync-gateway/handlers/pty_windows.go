//go:build windows

package handlers

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

type windowsConPTY struct {
	hPC       windows.Handle
	hProcess  windows.Handle
	hThread   windows.Handle
	inPipe    *os.File
	outPipe   *os.File
	closeOnce sync.Once
	closed    bool
	mu        sync.Mutex
}

func (p *windowsConPTY) Read(b []byte) (int, error) {
	return p.outPipe.Read(b)
}

func (p *windowsConPTY) Write(b []byte) (int, error) {
	return p.inPipe.Write(b)
}

func (p *windowsConPTY) Resize(cols, rows uint16) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed || p.hPC == 0 {
		return nil
	}
	return windows.ResizePseudoConsole(p.hPC, windows.Coord{X: int16(cols), Y: int16(rows)})
}

func (p *windowsConPTY) Close() error {
	p.closeOnce.Do(func() {
		p.mu.Lock()
		p.closed = true
		p.mu.Unlock()

		if p.inPipe != nil {
			_ = p.inPipe.Close()
		}
		if p.outPipe != nil {
			_ = p.outPipe.Close()
		}
		if p.hPC != 0 {
			windows.ClosePseudoConsole(p.hPC)
		}
		if p.hProcess != 0 {
			_ = windows.TerminateProcess(p.hProcess, 0)
			_ = windows.CloseHandle(p.hProcess)
		}
		if p.hThread != 0 {
			_ = windows.CloseHandle(p.hThread)
		}
	})
	return nil
}

type windowsFallbackPipe struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	stdout    io.ReadCloser
	stderr    io.ReadCloser
	closeOnce sync.Once
}

func (p *windowsFallbackPipe) Read(b []byte) (int, error) {
	return p.stdout.Read(b)
}

func (p *windowsFallbackPipe) Write(b []byte) (int, error) {
	return p.stdin.Write(b)
}

func (p *windowsFallbackPipe) Resize(cols, rows uint16) error {
	return nil
}

func (p *windowsFallbackPipe) Close() error {
	p.closeOnce.Do(func() {
		if p.stdin != nil {
			_ = p.stdin.Close()
		}
		if p.stdout != nil {
			_ = p.stdout.Close()
		}
		if p.stderr != nil {
			_ = p.stderr.Close()
		}
		if p.cmd != nil && p.cmd.Process != nil {
			_ = p.cmd.Process.Kill()
		}
	})
	return nil
}

func startPlatformTerminal(cmdStr string, args []string, dir string, env []string, cols, rows uint16) (LiveTerminal, error) {
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	// Try Windows ConPTY first (Windows 10 1809+ / Windows 11 / Windows Server)
	conPtyTerm, err := startConPTY(cmdStr, args, dir, env, cols, rows)
	if err == nil && conPtyTerm != nil {
		return conPtyTerm, nil
	}

	// Fallback to standard pipe shell
	cmdArgs := append([]string{}, args...)
	cmd := exec.Command(cmdStr, cmdArgs...)
	cmd.Dir = dir
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe error: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe error: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe error: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start fallback process: %w", err)
	}

	return &windowsFallbackPipe{
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
		stderr: stderr,
	}, nil
}

func startConPTY(cmdStr string, args []string, dir string, env []string, cols, rows uint16) (LiveTerminal, error) {
	var inPipeRead, inPipeWrite windows.Handle
	if err := windows.CreatePipe(&inPipeRead, &inPipeWrite, nil, 0); err != nil {
		return nil, err
	}

	var outPipeRead, outPipeWrite windows.Handle
	if err := windows.CreatePipe(&outPipeRead, &outPipeWrite, nil, 0); err != nil {
		_ = windows.CloseHandle(inPipeRead)
		_ = windows.CloseHandle(inPipeWrite)
		return nil, err
	}

	size := windows.Coord{X: int16(cols), Y: int16(rows)}
	var hPC windows.Handle
	if err := windows.CreatePseudoConsole(size, inPipeRead, outPipeWrite, 0, &hPC); err != nil {
		_ = windows.CloseHandle(inPipeRead)
		_ = windows.CloseHandle(inPipeWrite)
		_ = windows.CloseHandle(outPipeRead)
		_ = windows.CloseHandle(outPipeWrite)
		return nil, err
	}

	// The pseudo-console owns its copies of inPipeRead and outPipeWrite
	_ = windows.CloseHandle(inPipeRead)
	_ = windows.CloseHandle(outPipeWrite)

	attrList, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		windows.ClosePseudoConsole(hPC)
		_ = windows.CloseHandle(inPipeWrite)
		_ = windows.CloseHandle(outPipeRead)
		return nil, err
	}
	defer attrList.Delete()

	if err := attrList.Update(windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, unsafe.Pointer(hPC), unsafe.Sizeof(hPC)); err != nil {
		windows.ClosePseudoConsole(hPC)
		_ = windows.CloseHandle(inPipeWrite)
		_ = windows.CloseHandle(outPipeRead)
		return nil, err
	}

	siEx := windows.StartupInfoEx{
		StartupInfo: windows.StartupInfo{
			Cb:    uint32(unsafe.Sizeof(windows.StartupInfoEx{})),
			Flags: windows.STARTF_USESTDHANDLES,
		},
		ProcThreadAttributeList: attrList.List(),
	}

	fullCmdLine := cmdStr
	if len(args) > 0 {
		fullCmdLine = cmdStr + " " + strings.Join(args, " ")
	}

	cmdLinePtr, err := windows.UTF16PtrFromString(fullCmdLine)
	if err != nil {
		windows.ClosePseudoConsole(hPC)
		_ = windows.CloseHandle(inPipeWrite)
		_ = windows.CloseHandle(outPipeRead)
		return nil, err
	}

	var dirPtr *uint16
	if dir != "" {
		dirPtr, err = windows.UTF16PtrFromString(dir)
		if err != nil {
			windows.ClosePseudoConsole(hPC)
			_ = windows.CloseHandle(inPipeWrite)
			_ = windows.CloseHandle(outPipeRead)
			return nil, err
		}
	}

	envBlock := createWindowsEnvBlock(env)
	var pi windows.ProcessInformation
	flags := uint32(windows.EXTENDED_STARTUPINFO_PRESENT | windows.CREATE_UNICODE_ENVIRONMENT)

	if err := windows.CreateProcess(
		nil,
		cmdLinePtr,
		nil,
		nil,
		false,
		flags,
		envBlock,
		dirPtr,
		&siEx.StartupInfo,
		&pi,
	); err != nil {
		windows.ClosePseudoConsole(hPC)
		_ = windows.CloseHandle(inPipeWrite)
		_ = windows.CloseHandle(outPipeRead)
		return nil, err
	}

	return &windowsConPTY{
		hPC:      hPC,
		hProcess: pi.Process,
		hThread:  pi.Thread,
		inPipe:   os.NewFile(uintptr(inPipeWrite), "pty-in"),
		outPipe:  os.NewFile(uintptr(outPipeRead), "pty-out"),
	}, nil
}

func createWindowsEnvBlock(env []string) *uint16 {
	if len(env) == 0 {
		return nil
	}
	var block []uint16
	for _, entry := range env {
		u := syscall.StringToUTF16(entry)
		block = append(block, u...)
	}
	block = append(block, 0)
	return &block[0]
}
