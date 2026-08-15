package handlers

import "io"

// LiveTerminal defines the common interface for OS-specific PTY sessions.
type LiveTerminal interface {
	io.ReadWriteCloser
	Resize(cols, rows uint16) error
}
