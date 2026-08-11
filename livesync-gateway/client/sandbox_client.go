package client

import (
	"context"
	"log"
	"time"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type SandboxClient struct {
	conn   *grpc.ClientConn
	Client pb.SandboxServiceClient
}

func NewSandboxClient(cfg *config.Config) (*SandboxClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(
		ctx,
		cfg.SandboxGRPCURL,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		// Non-blocking fallback connection attempt
		log.Printf("Warning: Direct gRPC block dial to %s failed (%v), creating lazy connection.", cfg.SandboxGRPCURL, err)
		conn, err = grpc.Dial(
			cfg.SandboxGRPCURL,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			return nil, err
		}
	}

	client := pb.NewSandboxServiceClient(conn)
	return &SandboxClient{
		conn:   conn,
		Client: client,
	}, nil
}

func (s *SandboxClient) Close() {
	if s.conn != nil {
		s.conn.Close()
	}
}
