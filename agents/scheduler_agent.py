import threading
import time
from datetime import datetime, timedelta


class SchedulerAgent:
    def __init__(self):
        self.jobs = []
        self._lock = threading.Lock()

    def _register_job(self, schedule_type: str, job_fn, **schedule):
        job_record = {
            "name": getattr(job_fn, "__name__", "anonymous_job"),
            "schedule_type": schedule_type,
            "schedule": schedule,
            "thread": None,
            "last_run_at": None,
            "last_status": None,
            "last_error": None,
            "last_result": None,
            "run_count": 0,
            "next_run_at": None
        }
        self.jobs.append(job_record)
        return job_record

    def _execute_job(self, job_record: dict, job_fn):
        try:
            result = job_fn()
            with self._lock:
                job_record["last_run_at"] = datetime.now().isoformat()
                job_record["last_status"] = "success"
                job_record["last_error"] = None
                job_record["last_result"] = result
                job_record["run_count"] += 1
            return result
        except Exception as exc:
            with self._lock:
                job_record["last_run_at"] = datetime.now().isoformat()
                job_record["last_status"] = "failed"
                job_record["last_error"] = str(exc)
                job_record["last_result"] = None
                job_record["run_count"] += 1
            raise

    def get_job_reports(self):
        with self._lock:
            return [
                {
                    key: value
                    for key, value in job.items()
                    if key != "thread"
                }
                for job in self.jobs
            ]

    def add_interval_job(self, job_fn, seconds: int):
        job_record = self._register_job("interval", job_fn, seconds=seconds)

        def runner():
            while True:
                self._execute_job(job_record, job_fn)
                with self._lock:
                    job_record["next_run_at"] = (datetime.now() + timedelta(seconds=seconds)).isoformat()
                time.sleep(seconds)

        thread = threading.Thread(target=runner, daemon=True)
        job_record["thread"] = thread
        thread.start()

    def add_cron_job(self, job_fn, hour: int, minute: int):
        job_record = self._register_job("cron", job_fn, hour=hour, minute=minute)

        def runner():
            while True:
                now = datetime.now()
                run_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if run_time <= now:
                    run_time += timedelta(days=1)
                with self._lock:
                    job_record["next_run_at"] = run_time.isoformat()
                time.sleep((run_time - now).total_seconds())
                self._execute_job(job_record, job_fn)

        thread = threading.Thread(target=runner, daemon=True)
        job_record["thread"] = thread
        thread.start()
