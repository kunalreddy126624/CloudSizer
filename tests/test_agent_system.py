import unittest

from agents.dq_agent import DataQualityAgent
from agents.error_agent import ErrorMonitoringAgent
from agents.scheduler_agent import SchedulerAgent


class FakeWriter:
    def __init__(self):
        self.mode_value = None
        self.saved_table = None

    def mode(self, value):
        self.mode_value = value
        return self

    def saveAsTable(self, table_name):
        self.saved_table = table_name


class FakeDataFrame:
    def __init__(self, null_ok=True, range_ok=True, unique_ok=True):
        self.null_ok = null_ok
        self.range_ok = range_ok
        self.unique_ok = unique_ok
        self.write = FakeWriter()
        self._current_metric = None

    def filter(self, _condition):
        return self

    def groupBy(self, _column):
        self._current_metric = "unique"
        return self

    def count(self):
        if self._current_metric == "unique":
            return 0 if self.unique_ok else 1
        if self._current_metric == "null":
            return 0 if self.null_ok else 1
        if self._current_metric == "range":
            return 0 if self.range_ok else 1
        return 0


class AgentSystemTestCase(unittest.TestCase):
    def test_error_agent_reports_retry_success(self):
        attempts = {"count": 0}

        def flaky_job():
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise RuntimeError("network timeout")
            return "OK"

        agent = ErrorMonitoringAgent()
        report = agent.run(flaky_job)

        self.assertEqual(report["status"], "success")
        self.assertEqual(report["category"], "TRANSIENT")
        self.assertEqual(report["action_taken"], "retry")
        self.assertEqual(report["result"], "OK")
        self.assertEqual(report["attempts"], 3)

    def test_error_agent_reports_manual_intervention_for_unknown_error(self):
        agent = ErrorMonitoringAgent()
        report = agent.run(lambda: (_ for _ in ()).throw(RuntimeError("mystery failure")))

        self.assertEqual(report["status"], "manual_intervention_required")
        self.assertEqual(report["category"], "UNKNOWN")
        self.assertEqual(report["action_taken"], "alert")
        self.assertIsNone(report["result"])

    def test_dq_agent_reports_rule_failures_and_quarantine_target(self):
        rules = [
            {"type": "null", "column": "amount"},
            {"type": "range", "column": "amount", "min": 0, "max": 1000},
            {"type": "unique", "column": "id"}
        ]
        df = FakeDataFrame(null_ok=False, range_ok=True, unique_ok=True)
        agent = DataQualityAgent(rules)
        agent.check_nulls = lambda _df, _column: False
        agent.check_range = lambda _df, _column, _min_val, _max_val: True
        agent.check_unique = lambda _df, _column: True
        report = agent.process(df)

        self.assertFalse(report["passed"])
        self.assertEqual(report["target_table"], "quarantine_table")
        self.assertEqual(df.write.saved_table, "quarantine_table")
        self.assertEqual(len(report["rule_results"]), 3)
        self.assertFalse(report["rule_results"][0]["passed"])

    def test_scheduler_agent_tracks_job_execution_metadata(self):
        agent = SchedulerAgent()
        calls = []

        def job():
            calls.append("ran")
            return "done"

        job_record = agent._register_job("interval", job, seconds=30)
        result = agent._execute_job(job_record, job)

        reports = agent.get_job_reports()
        self.assertEqual(result, "done")
        self.assertEqual(calls, ["ran"])
        self.assertEqual(reports[0]["last_status"], "success")
        self.assertEqual(reports[0]["last_result"], "done")
        self.assertEqual(reports[0]["run_count"], 1)


if __name__ == "__main__":
    unittest.main()
