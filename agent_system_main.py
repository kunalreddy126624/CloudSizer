from agents.dq_agent import DataQualityAgent
from agents.error_agent import ErrorMonitoringAgent
from agents.scheduler_agent import SchedulerAgent
from utils.config_loader import load_config


def build_spark_session():
    try:
        from pyspark.sql import SparkSession
    except ImportError as exc:
        raise RuntimeError("pyspark is required to run agent_system_main.py.") from exc

    return SparkSession.builder.appName("AgentSystem").getOrCreate()


def run_pipeline_once():
    spark = build_spark_session()
    config = load_config()

    data = [(1, 100), (2, 200), (3, None)]
    df = spark.createDataFrame(data, ["id", "amount"])

    dq_agent = DataQualityAgent(config["dq_rules"])
    error_agent = ErrorMonitoringAgent()

    def job():
        dq_report = dq_agent.process(df)
        return f"SUCCESS -> {dq_report['target_table']}"

    return {
        "error_agent": error_agent.run(job),
        "dq_agent": dq_agent.last_process_report
    }


def main():
    scheduler = SchedulerAgent()

    def pipeline():
        result = run_pipeline_once()
        print(f"Pipeline run: {result}")

    scheduler.add_interval_job(pipeline, 60)
    scheduler.add_cron_job(pipeline, 14, 30)

    while True:
        import time

        time.sleep(60)


if __name__ == "__main__":
    main()
