resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.name}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.apps.id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

locals {
  # Placeholder for the first apply; the deploy workflow sets the real images afterwards.
  placeholder_image = "mcr.microsoft.com/k8se/quickstart:latest"

  # App secrets are references into Key Vault, read with the managed identity at start-up.
  api_secrets = {
    "postgres-url"       = "POSTGRES_URL"
    "jwt-secret"         = "JWT_SECRET"
    "jwt-refresh-secret" = "JWT_REFRESH_SECRET"
    "admin-password"     = "ADMIN_PASSWORD"
    "azure-openai-key"   = "AZURE_OPENAI_API_KEY"
  }
}

resource "azurerm_container_app" "api" {
  name                         = "ca-${var.name}-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.apps.id
  }

  dynamic "secret" {
    for_each = local.api_secrets
    content {
      name                = secret.key
      key_vault_secret_id = azurerm_key_vault_secret.app[secret.key].versionless_id
      identity            = azurerm_user_assigned_identity.apps.id
    }
  }

  ingress {
    external_enabled = true
    target_port      = 5000

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    # Redis runs as a sidecar and holds refresh tokens, so keep exactly one replica.
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "api"
      image  = local.placeholder_image
      cpu    = 1
      memory = "2Gi"

      dynamic "env" {
        for_each = local.api_secrets
        content {
          name        = env.value
          secret_name = env.key
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "5000"
      }
      env {
        name  = "TRUST_PROXY"
        value = "true"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://localhost:6379"
      }
      env {
        name  = "DEFAULT_LLM_PROVIDER"
        value = "azure-openai"
      }
      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = azurerm_cognitive_account.openai.endpoint
      }
      env {
        name  = "AZURE_OPENAI_CHAT_DEPLOYMENTS"
        value = azurerm_cognitive_deployment.chat.name
      }
      env {
        name  = "EMBEDDING_PROVIDER"
        value = "azure-openai"
      }
      env {
        name  = "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
        value = azurerm_cognitive_deployment.embedding.name
      }
      env {
        name  = "EMBEDDING_DIMENSION"
        value = tostring(var.embedding_dimension)
      }
    }

    container {
      name   = "redis"
      image  = "docker.io/library/redis:7-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [
    azurerm_role_assignment.apps_read_secrets,
    azurerm_role_assignment.apps_pull_images,
  ]
}

resource "azurerm_container_app" "web" {
  name                         = "ca-${var.name}-web"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.apps.id
  }

  ingress {
    external_enabled = true
    target_port      = 3000

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 2

    container {
      name   = "web"
      image  = local.placeholder_image
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.apps_pull_images]
}
