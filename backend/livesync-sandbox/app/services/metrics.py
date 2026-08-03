import time
import psutil
from prometheus_client import Counter, Histogram, Gauge

# Prometheus Metrics Definitions
EXECUTION_COUNTER = Counter(
    "sandbox_executions_total",
    "Total sandbox execution requests",
    ["language", "status"],
)

EXECUTION_DURATION_HISTOGRAM = Histogram(
    "sandbox_execution_duration_seconds",
    "Sandbox execution latency in seconds",
    ["language"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

EXECUTION_MEMORY_HISTOGRAM = Histogram(
    "sandbox_execution_memory_bytes",
    "Peak RAM memory consumed by execution process",
    ["language"],
    buckets=[100 * 1024, 1024 * 1024, 10 * 1024 * 1024, 50 * 1024 * 1024, 100 * 1024 * 1024],
)

ACTIVE_EXECUTIONS_GAUGE = Gauge(
    "sandbox_active_executions",
    "Current active code executions in progress",
)


def get_process_metrics(pid: int) -> tuple[int, float]:
    """
    Attempts to retrieve peak memory (bytes) and CPU time (ms) for a target PID.
    Returns (peak_memory_bytes, cpu_time_ms).
    """
    try:
        proc = psutil.Process(pid)
        mem_info = proc.memory_info()
        cpu_times = proc.cpu_times()
        peak_mem = mem_info.rss
        cpu_ms = (cpu_times.user + cpu_times.system) * 1000.0
        return peak_mem, cpu_ms
    except Exception:
        return 1024 * 1024, 0.0  # Fallback 1MB default estimate if process terminated
