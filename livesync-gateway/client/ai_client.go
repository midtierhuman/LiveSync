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

type AIClient struct {
	conn   *grpc.ClientConn
	Client pb.AIServiceClient
}

func NewAIClient(cfg *config.Config) (*AIClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	targetURL := cfg.AIGRPCURL
	if targetURL == "" {
		targetURL = cfg.SandboxGRPCURL
	}
	if targetURL == "" {
		targetURL = "127.0.0.1:50051"
	}

	conn, err := grpc.DialContext(
		ctx,
		targetURL,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		log.Printf("Warning: Direct gRPC block dial to %s failed (%v), creating lazy connection.", targetURL, err)
		conn, err = grpc.Dial(
			targetURL,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			return nil, err
		}
	}

	client := pb.NewAIServiceClient(conn)
	return &AIClient{
		conn:   conn,
		Client: client,
	}, nil
}

func (s *AIClient) Close() {
	if s.conn != nil {
		s.conn.Close()
	}
}
