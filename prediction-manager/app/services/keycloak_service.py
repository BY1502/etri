import os
import time
import httpx

KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "http://keycloak.keycloak.svc.cluster.local/auth")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "kubeflow")
KEYCLOAK_USERNAME = os.environ.get("KEYCLOAK_USERNAME", "admin")
KEYCLOAK_PASSWORD = os.environ.get("KEYCLOAK_PASSWORD", "")

_token_cache = {"access_token": None, "expires_at": 0}


def _get_admin_token() -> str:
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expires_at"] > now + 30:
        return _token_cache["access_token"]
    resp = httpx.post(
        f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
        data={
            "client_id": "admin-cli",
            "username": KEYCLOAK_USERNAME,
            "password": KEYCLOAK_PASSWORD,
            "grant_type": "password",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 60)
    return data["access_token"]


def _headers() -> dict:
    return {"Authorization": f"Bearer {_get_admin_token()}"}


def list_users() -> list[dict]:
    resp = httpx.get(
        f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users",
        headers=_headers(),
        params={"max": 1000},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_user_by_email(email: str) -> dict | None:
    resp = httpx.get(
        f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users",
        headers=_headers(),
        params={"email": email, "exact": "true"},
        timeout=15,
    )
    resp.raise_for_status()
    users = resp.json()
    return users[0] if users else None


def create_user(email: str, first_name: str, last_name: str, password: str, temporary: bool = True) -> str:
    """Create user, set initial password, return user ID."""
    payload = {
        "username": email,
        "email": email,
        "firstName": first_name or email.split("@")[0],
        "lastName": last_name or "User",
        "enabled": True,
        "emailVerified": True,
        "credentials": [
            {"type": "password", "value": password, "temporary": temporary}
        ],
    }
    resp = httpx.post(
        f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users",
        headers=_headers(),
        json=payload,
        timeout=15,
    )
    if resp.status_code == 409:
        raise ValueError(f"이미 존재하는 사용자입니다: {email}")
    resp.raise_for_status()
    user = get_user_by_email(email)
    return user["id"] if user else ""


def reset_password(email: str, password: str, temporary: bool = True) -> None:
    user = get_user_by_email(email)
    if not user:
        raise ValueError(f"사용자를 찾을 수 없습니다: {email}")
    resp = httpx.put(
        f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user['id']}/reset-password",
        headers=_headers(),
        json={"type": "password", "value": password, "temporary": temporary},
        timeout=15,
    )
    resp.raise_for_status()


def delete_user(email: str) -> bool:
    user = get_user_by_email(email)
    if not user:
        return False
    resp = httpx.delete(
        f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user['id']}",
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return True


def set_user_enabled(email: str, enabled: bool) -> None:
    user = get_user_by_email(email)
    if not user:
        raise ValueError(f"사용자를 찾을 수 없습니다: {email}")
    resp = httpx.put(
        f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users/{user['id']}",
        headers=_headers(),
        json={"enabled": enabled},
        timeout=15,
    )
    resp.raise_for_status()
