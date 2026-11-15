output "web_url" {
  value = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "api_url" {
  description = "Use as NEXT_PUBLIC_API_URL (the deploy workflow does this for you)."
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}/api/v1"
}

output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "acr_name" {
  value = azurerm_container_registry.main.name
}

output "github_client_id" {
  description = "Set as the AZURE_CLIENT_ID repository variable."
  value       = local.github_enabled ? azurerm_user_assigned_identity.github[0].client_id : null
}

output "tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "subscription_id" {
  value = data.azurerm_client_config.current.subscription_id
}

output "admin_password_secret" {
  description = "Read the generated admin password with: az keyvault secret show --vault-name <vault> --name admin-password"
  value       = azurerm_key_vault.main.name
}
