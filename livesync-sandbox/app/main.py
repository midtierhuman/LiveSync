import logging
import signal
import sys
import threading
from app.config import settings
from app.grpc_server import serve_grpc
from app.services.csharp_warmup import csharp_warmup_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    logger.info("Initializing LiveSync Polyglot Sandbox gRPC Worker...")
    logger.info(f"Environment: {settings.environment}")

    # Pre-warm polyglot runtime environments (C# Roslyn / .NET) asynchronously
    warmup_thread = threading.Thread(
        target=csharp_warmup_service.initialize,
        name="RuntimeWarmupThread",
        daemon=True,
    )
    warmup_thread.start()

    # Start the gRPC server on port 50051
    grpc_port = 50051
    server = serve_grpc(port=grpc_port)
    logger.info(f"⚡ LiveSync gRPC Sandbox Service running on port {grpc_port}")

    # Handle graceful termination signals
    def handle_shutdown(signum, frame):
        sig_name = signal.Signals(signum).name
        logger.info(f"Received {sig_name}. Gracefully stopping gRPC server...")
        stop_event = server.stop(grace=5)
        stop_event.wait(timeout=5)
        logger.info("LiveSync gRPC Sandbox Service stopped cleanly.")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # Block main thread while serving gRPC requests
    server.wait_for_termination()


if __name__ == "__main__":
    main()
