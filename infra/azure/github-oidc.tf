# GitHub Actions signs in with a federated token, so no Azure secret or password is stored in GitHub.

locals {
  github_enabled = var.github_repository != ""
}

resource "azurerm_user_assigned_identity" "github" {
  count               = local.github_enabled ? 1 : 0
  name                = "id-${var.name}-github"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_federated_identity_credential" "github_main" {
  count               = local.github_enabled ? 1 : 0
  name                = "github-main"
  resource_group_name = azurerm_resource_group.main.name
  parent_id           = azurerm_user_assigned_identity.github[0].id
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository}:ref:refs/heads/main"
  audience            = ["api://AzureADTokenExchange"]
}

resource "azurerm_role_assignment" "github_push_images" {
  count                = local.github_enabled ? 1 : 0
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_user_assigned_identity.github[0].principal_id
}

# Only the two apps, not the whole resource group.
resource "azurerm_role_assignment" "github_updates_apps" {
  for_each = {
    for app, id in { api = azurerm_container_app.api.id, web = azurerm_container_app.web.id } : app => id
    if local.github_enabled
  }
  scope                = each.value
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.github[0].principal_id
}
