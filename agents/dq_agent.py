from __future__ import annotations

from datetime import datetime


def _spark_functions():
    try:
        from pyspark.sql.functions import col
    except ImportError as exc:
        raise RuntimeError("pyspark is required to use DataQualityAgent.") from exc
    return col


class DataQualityAgent:
    def __init__(self, rules: list[dict]):
        self.rules = rules
        self.last_check_report = None
        self.last_process_report = None

    def check_nulls(self, df, column: str) -> bool:
        col = _spark_functions()
        return df.filter(col(column).isNull()).count() == 0

    def check_range(self, df, column: str, min_val, max_val) -> bool:
        col = _spark_functions()
        return df.filter((col(column) < min_val) | (col(column) > max_val)).count() == 0

    def check_unique(self, df, column: str) -> bool:
        col = _spark_functions()
        return df.groupBy(column).count().filter(col("count") > 1).count() == 0

    def evaluate_rule(self, df, rule: dict) -> dict:
        rule_type = rule["type"]
        if rule_type == "null":
            passed = self.check_nulls(df, rule["column"])
        elif rule_type == "range":
            passed = self.check_range(df, rule["column"], rule["min"], rule["max"])
        elif rule_type == "unique":
            passed = self.check_unique(df, rule["column"])
        else:
            raise ValueError(f"Unsupported rule type: {rule_type}")

        return {
            "type": rule_type,
            "column": rule["column"],
            "passed": passed,
            "rule": dict(rule)
        }

    def run_checks(self, df) -> dict:
        rule_results: list[dict] = []
        for rule in self.rules:
            rule_results.append(self.evaluate_rule(df, rule))

        report = {
            "passed": all(result["passed"] for result in rule_results),
            "rule_results": rule_results,
            "checked_at": datetime.utcnow().isoformat() + "Z"
        }
        self.last_check_report = report
        return report

    def process(self, df) -> dict:
        check_report = self.run_checks(df)
        target_table = "silver_table" if check_report["passed"] else "quarantine_table"
        df.write.mode("overwrite").saveAsTable(target_table)
        process_report = {
            "status": "success",
            "passed": check_report["passed"],
            "target_table": target_table,
            "rule_results": check_report["rule_results"],
            "processed_at": datetime.utcnow().isoformat() + "Z"
        }
        self.last_process_report = process_report
        return process_report
