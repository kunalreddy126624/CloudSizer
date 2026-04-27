import time


def retry(fn, retries: int = 3, delay: int = 2, backoff: int = 2):
    current_delay = delay
    for attempt in range(retries):
        try:
            return fn()
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(current_delay)
            current_delay *= backoff


def retry_with_report(fn, retries: int = 3, delay: int = 2, backoff: int = 2):
    attempts = 0

    def wrapped():
        nonlocal attempts
        attempts += 1
        return fn()

    result = retry(wrapped, retries=retries, delay=delay, backoff=backoff)
    return {
        "result": result,
        "attempts": attempts,
        "retries_used": max(attempts - 1, 0)
    }
