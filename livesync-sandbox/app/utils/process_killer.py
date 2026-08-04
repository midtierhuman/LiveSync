import psutil


def kill_process_tree(pid: int) -> None:
    """
    Safely terminates a process and all of its spawned child sub-processes / worker threads recursively.
    """
    try:
        parent = psutil.Process(pid)
        for child in parent.children(recursive=True):
            try:
                child.kill()
            except (psutil.NoSuchProcess, Exception):
                pass
        parent.kill()
    except (psutil.NoSuchProcess, Exception):
        pass
