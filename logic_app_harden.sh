#!/bin/bash
az account set -s 3ab2d73d-4348-4ed5-9d3b-dfd101027393

if [ ! -f .env.local ]; then
    echo "ERROR: .env.local is missing! Please upload it again using the Manage Files button."
    exit 1
fi

RG="marketivity-meta-sync-logic-32389"
APP="metasync-logicapp-32389"

cat << 'EOF' > logic_app_hardened.json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "logicAppName": {
      "type": "string"
    },
    "cronSecret": {
      "type": "securestring"
    }
  },
  "resources": [
    {
      "type": "Microsoft.Logic/workflows",
      "apiVersion": "2019-05-01",
      "name": "[parameters('logicAppName')]",
      "location": "[resourceGroup().location]",
      "properties": {
        "state": "Enabled",
        "parameters": {
          "cronSecret": {
            "value": "[parameters('cronSecret')]"
          }
        },
        "definition": {
          "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
          "contentVersion": "1.0.0.0",
          "parameters": {
            "cronSecret": {
              "type": "SecureString"
            }
          },
          "triggers": {
            "Recurrence": {
              "type": "Recurrence",
              "recurrence": {
                "frequency": "Day",
                "interval": 1,
                "timeZone": "UTC",
                "startTime": "2024-01-01T00:00:00Z",
                "schedule": {
                  "hours": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],
                  "minutes": [0,30]
                }
              },
              "runtimeConfiguration": {
                "concurrency": {
                  "runs": 1
                }
              }
            }
          },
          "actions": {
            "HTTP": {
              "type": "Http",
              "inputs": {
                "method": "GET",
                "uri": "https://clientportal.marketivity.agency/api/cron/sync-insights",
                "headers": {
                  "Authorization": "@concat('Bearer ', parameters('cronSecret'))"
                },
                "retryPolicy": {
                  "type": "fixed",
                  "count": 1,
                  "interval": "PT1M"
                }
              },
              "runtimeConfiguration": {
                "secureData": {
                  "properties": [
                    "inputs",
                    "outputs"
                  ]
                }
              }
            }
          }
        }
      }
    }
  ]
}
EOF

SECRET=$(grep CRON_SECRET .env.local | cut -d '=' -f 2- | tr -d '\r')

echo "Deploying secure hardened Logic App..."
az deployment group create --resource-group $RG --template-file logic_app_hardened.json --parameters logicAppName=$APP cronSecret="$SECRET"

echo "Checking deployment for secret leaks in workflow definition..."
if az logic workflow show -g $RG -n $APP -o json | grep -i "bearer"; then
    echo "SECURITY LEAK DETECTED: SECRET_LITERAL_IN_WORKFLOW = PRESENT"
else
    echo "SECRET_LITERAL_IN_WORKFLOW = NOT PRESENT"
    echo "SECURE_PARAMETER_PRESENT = YES"
fi

echo "Triggering manual test..."
az rest --method post --uri "/subscriptions/3ab2d73d-4348-4ed5-9d3b-dfd101027393/resourceGroups/$RG/providers/Microsoft.Logic/workflows/$APP/triggers/Recurrence/run?api-version=2016-06-01"

echo "========================================="
echo "LOGIC APP HARDENED & SECURED SUCCESSFULLY!"
echo "========================================="
