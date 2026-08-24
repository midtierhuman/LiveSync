package handlers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/pb"
	"google.golang.org/grpc"
)

type mockAIServiceClient struct {
	pb.AIServiceClient
}

func (m *mockAIServiceClient) GetLanguages(ctx context.Context, in *pb.Empty, opts ...grpc.CallOption) (*pb.LanguagesResponse, error) {
	return &pb.LanguagesResponse{
		Languages: []*pb.LanguageDescriptor{
			{Name: "python", DisplayName: "Python 3.14"},
			{Name: "javascript", DisplayName: "JavaScript"},
		},
	}, nil
}

func (m *mockAIServiceClient) AnalyzeCode(ctx context.Context, in *pb.AiAnalysisRequest, opts ...grpc.CallOption) (*pb.AiAnalysisResponse, error) {
	return &pb.AiAnalysisResponse{
		Action:      in.Action,
		Language:    in.Language,
		Explanation: "Mock analysis complete",
		Suggestions: []string{"Suggestion 1"},
		Provider:    "Mock LLM",
	}, nil
}

type mockServerStreamingClient struct {
	grpc.ServerStreamingClient[pb.AiAnalysisChunk]
	chunks []*pb.AiAnalysisChunk
	index  int
}

func (m *mockServerStreamingClient) Recv() (*pb.AiAnalysisChunk, error) {
	if m.index >= len(m.chunks) {
		return nil, io.EOF
	}
	chunk := m.chunks[m.index]
	m.index++
	return chunk, nil
}

func (m *mockAIServiceClient) StreamAnalyzeCode(ctx context.Context, in *pb.AiAnalysisRequest, opts ...grpc.CallOption) (grpc.ServerStreamingClient[pb.AiAnalysisChunk], error) {
	return &mockServerStreamingClient{
		chunks: []*pb.AiAnalysisChunk{
			{Delta: "Analyzing...", Stage: "analyzing", Provider: "Mock Stream", IsFinal: false},
			{Delta: "Code looks good.", Stage: "streaming", Provider: "Mock Stream", IsFinal: false},
			{Delta: "", Stage: "complete", Provider: "Mock Stream", IsFinal: true, Suggestions: []string{"Keep clean"}},
		},
	}, nil
}

func TestAIHandler_ListModels(t *testing.T) {
	cfg := &config.Config{}
	aiHandler := NewAIHandler(cfg, &mockAIServiceClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/ai/models", nil)
	w := httptest.NewRecorder()

	aiHandler.ListModels(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	body := w.Body.String()
	if !strings.Contains(body, "gemini-3.5-flash") {
		t.Fatalf("expected gemini-3.5-flash in response, got %s", body)
	}
}

func TestAIHandler_AnalyzeCode(t *testing.T) {
	cfg := &config.Config{}
	aiHandler := NewAIHandler(cfg, &mockAIServiceClient{})

	reqBody := `{"action":"explain","language":"python","code":"x = 1"}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/analyze", strings.NewReader(reqBody))
	w := httptest.NewRecorder()

	aiHandler.AnalyzeCode(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	body := w.Body.String()
	if !strings.Contains(body, "Mock analysis complete") {
		t.Fatalf("expected mock explanation, got %s", body)
	}
}

func TestAIHandler_StreamAnalyzeCode_SSE(t *testing.T) {
	cfg := &config.Config{}
	aiHandler := NewAIHandler(cfg, &mockAIServiceClient{})

	reqBody := `{"action":"explain","language":"python","code":"def add(a, b): return a + b"}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/stream", strings.NewReader(reqBody))
	w := httptest.NewRecorder()

	aiHandler.StreamAnalyzeCode(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	contentType := w.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/event-stream") {
		t.Fatalf("expected text/event-stream content type, got %s", contentType)
	}

	body := w.Body.String()
	if !strings.Contains(body, "data:") {
		t.Fatalf("expected SSE data: prefix in stream, got %s", body)
	}
	if !strings.Contains(body, "Code looks good.") {
		t.Fatalf("expected streamed delta in body, got %s", body)
	}
}
