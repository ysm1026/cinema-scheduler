"""Budget exceeded auto-shutdown Cloud Function.

Triggered by Pub/Sub message from GCP billing budget notification.
When cost >= budget, disables Cloud Run service and pauses Cloud Scheduler job.
"""

import base64
import json
import os

import functions_framework
from google.cloud import run_v2
from google.cloud import scheduler_v1

PROJECT_ID = os.environ["GCP_PROJECT_ID"]
REGION = os.environ["GCP_REGION"]
CLOUD_RUN_SERVICE = os.environ["CLOUD_RUN_SERVICE"]
SCHEDULER_JOB = os.environ["SCHEDULER_JOB"]


@functions_framework.cloud_event
def handle_budget_notification(cloud_event):
    """Handle billing budget Pub/Sub notification."""
    data = base64.b64decode(cloud_event.data["message"]["data"]).decode("utf-8")
    notification = json.loads(data)

    cost_amount = notification.get("costAmount", 0)
    budget_amount = notification.get("budgetAmount", 0)

    print(f"Budget notification: cost={cost_amount}, budget={budget_amount}")

    if cost_amount < budget_amount:
        print(f"Cost ({cost_amount}) is under budget ({budget_amount}). No action.")
        return

    print(f"BUDGET EXCEEDED: cost={cost_amount} >= budget={budget_amount}")

    _disable_cloud_run_service()
    _pause_scheduler_job()

    print("Shutdown complete.")


def _disable_cloud_run_service():
    """Block external traffic by switching ingress to internal-only."""
    client = run_v2.ServicesClient()
    service_name = f"projects/{PROJECT_ID}/locations/{REGION}/services/{CLOUD_RUN_SERVICE}"

    service = client.get_service(name=service_name)

    if service.ingress == run_v2.types.IngressTraffic.INGRESS_TRAFFIC_INTERNAL_ONLY:
        print(f"Service '{CLOUD_RUN_SERVICE}' already set to internal-only.")
        return

    service.ingress = run_v2.types.IngressTraffic.INGRESS_TRAFFIC_INTERNAL_ONLY

    operation = client.update_service(
        request=run_v2.UpdateServiceRequest(service=service)
    )
    operation.result(timeout=120)
    print(f"Service '{CLOUD_RUN_SERVICE}' ingress set to INTERNAL_ONLY.")


def _pause_scheduler_job():
    """Pause the Cloud Scheduler job to stop the scraper."""
    client = scheduler_v1.CloudSchedulerClient()
    job_name = f"projects/{PROJECT_ID}/locations/{REGION}/jobs/{SCHEDULER_JOB}"

    try:
        client.pause_job(name=job_name)
        print(f"Scheduler job '{SCHEDULER_JOB}' paused.")
    except Exception as e:
        print(f"Warning: Could not pause scheduler job: {e}")
