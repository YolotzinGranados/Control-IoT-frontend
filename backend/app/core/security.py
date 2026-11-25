"""Autorización por roles mediante JWT validado contra la sesión del usuario."""
from app.core.auth import require_roles

# Las operaciones administrativas requieren un JWT válido y el rol admin.
# Los roles se consultan nuevamente en la base de datos mediante get_current_principal.
requiere_admin = require_roles("admin")

# Se conserva la política existente para los endpoints de control del vehículo.
# La autorización específica de cliente/invitado y dispositivo debe definirse
# en una etapa independiente para no romper el control físico ya desplegado.
def requiere_control() -> None:
    return None
