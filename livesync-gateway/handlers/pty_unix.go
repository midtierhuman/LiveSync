//go:build !windows

package handlers

import (
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

type unixPTY struct {
	ptmx      *os.File
	cmd       *exec.Cmd
	closeOnce sync.Once
}

func (p *unixPTY) Read(b []byte) (int, error) {
	return p.ptmx.Read(b)
}

func (p *unixPTY) Write(b []byte) (int, error) {
	return p.ptmx.Write(b)
}

func (p *unixPTY) Resize(cols, rows uint16) error {
	if p.ptmx == nil || cols == 0 || rows == 0 {
		return nil
	}
	return pty.Setsize(p.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

func (p *unixPTY) Close() error {
	p.closeOnce.Do(func() {
		if p.ptmx != nil {
			_ = p.ptmx.Close()
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
	cmd := exec.Command(cmdStr, args...)
	cmd.Dir = dir
	cmd.Env = env

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}

	return &unixPTY{ptmx: ptmx, cmd: cmd}, nil
}
