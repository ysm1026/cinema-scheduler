"""Budget exceeded auto-shutdown Cloud Function.

Triggered by Pub/Sub message from GCP billing budget notification.
When cost >= budget, stops the GCE instance.
"""

import base64
import json
import os

import functions_framework
from google.cloud import compute_v1

GCP_PROJECT_ID = os.environ["GCP_PROJECT_ID"]
GCE_ZONE = os.environ["GCE_ZONE"]
GCE_INSTANCE = os.environ["GCE_INSTANCE"]


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

    _stop_instance()

    print("Shutdown complete.")


def _stop_instance():
    """Stop the GCE instance."""
    client = compute_v1.InstancesClient()

    instance = client.get(
        project=GCP_PROJECT_ID, zone=GCE_ZONE, instance=GCE_INSTANCE
    )

    if instance.status in ("TERMINATED", "STOPPED"):
        print(f"Instance '{GCE_INSTANCE}' is already stopped.")
        return

    operation = client.stop(
        project=GCP_PROJECT_ID, zone=GCE_ZONE, instance=GCE_INSTANCE
    )
    operation.result(timeout=120)
    print(f"Instance '{GCE_INSTANCE}' stopped.")
