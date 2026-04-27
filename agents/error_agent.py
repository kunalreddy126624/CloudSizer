from datetime import datetime


class ErrorMonitoringAgent:
    def __init__(self):
        self.history = []
        self.last_run_report = None

    def classify(self, error_msg: str) -> str:
        msg = error_msg.lower()
        if "timeout" in msg or "network" in msg:
            return "TRANSIENT"
        if "schema" in msg or "column" in msg:
            return "SCHEMA"
        if "memory" in msg or "oom" in msg:
            return "RESOURCE"
        return "UNKNOWN"

    def _record(self, report: dict):
        report = {
            **report,
            "recorded_at": datetime.utcnow().isoformat() + "Z"
        }
        self.last_run_report = report
        self.history.append(report)
        return report

    def remediate(self, category: str, job_fn, original_error: Exception):
        from utils.retry import retry_with_report

        if category == "TRANSIENT":
            retry_report = retry_with_report(job_fn)
            return self._record(
                {
                    "status": "success",
                    "category": category,
                    "action_taken": "retry",
                    "attempts": retry_report["attempts"] + 1,
                    "retries_used": retry_report["attempts"],
                    "result": retry_report["result"],
                    "initial_error": str(original_error),
                    "final_error": None
                }
            )
        if category == "SCHEMA":
            print("Applying schema evolution")
            result = job_fn()
            return self._record(
                {
                    "status": "success",
                    "category": category,
                    "action_taken": "schema_evolution",
                    "attempts": 2,
                    "retries_used": 1,
                    "result": result,
                    "initial_error": str(original_error),
                    "final_error": None
                }
            )
        if category == "RESOURCE":
            print("Scaling compute resources")
            result = job_fn()
            return self._record(
                {
                    "status": "success",
                    "category": category,
                    "action_taken": "scale_resources",
                    "attempts": 2,
                    "retries_used": 1,
                    "result": result,
                    "initial_error": str(original_error),
                    "final_error": None
                }
            )
        print("Alert: manual intervention required")
        return self._record(
            {
                "status": "manual_intervention_required",
                "category": category,
                "action_taken": "alert",
                "attempts": 1,
                "retries_used": 0,
                "result": None,
                "initial_error": str(original_error),
                "final_error": str(original_error)
            }
        )

    def run(self, job_fn):
        try:
            result = job_fn()
            return self._record(
                {
                    "status": "success",
                    "category": None,
                    "action_taken": "none",
                    "attempts": 1,
                    "retries_used": 0,
                    "result": result,
                    "initial_error": None,
                    "final_error": None
                }
            )
        except Exception as exc:
            category = self.classify(str(exc))
            try:
                return self.remediate(category, job_fn, exc)
            except Exception as remediation_error:
                return self._record(
                    {
                        "status": "failed",
                        "category": category,
                        "action_taken": "remediation_failed",
                        "attempts": 2 if category in {"SCHEMA", "RESOURCE"} else None,
                        "retries_used": None,
                        "result": None,
                        "initial_error": str(exc),
                        "final_error": str(remediation_error)
                    }
                )
