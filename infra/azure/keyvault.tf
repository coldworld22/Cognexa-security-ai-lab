resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.unique}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
}

# Whoever runs Terraform may write secrets; the apps may only read them.
resource "azurerm_role_assignment" "deployer_writes_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "apps_read_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 64
  special = false
}

resource "random_password" "admin" {
  length  = 24
  special = false
}

locals {
  secrets = {
    "postgres-url"       = local.postgres_url
    "jwt-secret"         = random_password.jwt.result
    "jwt-refresh-secret" = random_password.jwt_refresh.result
    "admin-password"     = random_password.admin.result
    "azure-openai-key"   = azurerm_cognitive_account.openai.primary_access_key
  }
}

resource "azurerm_key_vault_secret" "app" {
  # The names are listed explicitly because for_each can't iterate over a map holding sensitive values.
  for_each     = toset(["postgres-url", "jwt-secret", "jwt-refresh-secret", "admin-password", "azure-openai-key"])
  name         = each.key
  value        = local.secrets[each.key]
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployer_writes_secrets]
}
