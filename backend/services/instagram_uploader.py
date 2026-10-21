# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
Instagram Reels upload via Instagram Graph API.

Prerequisites:
- User has a Facebook Page linked to an Instagram Professional account
- User has authorized ViralMint with 'instagram_content_publish' permission
- Access token stored in user_settings.instagram_access_token_encrypted

Flow:
1. Upload video to a public URL (or use a pre-signed S3 URL)
2. POST /{ig-user-id}/media with media_type=REELS, video_url, caption
3. Poll creation status until finished
4. POST /{ig-user-id}/media_publish with creation_id
"""
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v19.0"


async def upload_to_instagram(
    video_path: str,
    caption: str = "",
    access_token: str = "",
    ig_user_id: str = "",
) -> dict:
    """
    Upload a Reel to Instagram via the Graph API.

    Returns: {"media_id": "...", "permalink": "..."}
    """
    if not access_token:
        from backend.core.exceptions import UploadAuthError
        raise UploadAuthError("Instagram not connected. Connect your Instagram account in Settings.")

    if not ig_user_id:
        # Fetch the IG user ID from the access token
        ig_user_id = await _get_ig_user_id(access_token)
        if not ig_user_id:
            from backend.core.exceptions import UploadAuthError
            raise UploadAuthError(
                "Could not determine Instagram user ID. "
                "Ensure your Facebook Page is linked to an Instagram Professional account."
            )

    video_path_obj = Path(video_path)
    if not video_path_obj.exists():
        from backend.core.exceptions import UploadError
        raise UploadError(f"Video file not found: {video_path}")

    # Instagram Graph API requires a publicly accessible URL for the video.
    # For local desktop apps, we need to temporarily serve the file or use
    # a transfer service. We'll use a local HTTP server approach.
    video_url = await _get_public_video_url(video_path_obj)

    # Step 1: Create media container
    container_id = await _create_media_container(
        ig_user_id, video_url, caption, access_token
    )

    # Step 2: Poll until container is ready
    await _wait_for_container(container_id, access_token)

    # Step 3: Publish
    media_id = await _publish_container(ig_user_id, container_id, access_token)

    # Step 4: Get permalink
    permalink = await _get_permalink(media_id, access_token)

    return {
        "media_id": media_id,
        "permalink": permalink,
    }


async def _get_ig_user_id(access_token: str) -> str | None:
    """Get the Instagram user ID associated with the access token."""
    import httpx

    def _fetch():
        # First get the Facebook Page ID
        resp = httpx.get(
            f"{GRAPH_API_BASE}/me/accounts",
            params={"access_token": access_token},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning(f"Failed to get FB pages: {resp.text}")
            return None

        pages = resp.json().get("data", [])
        if not pages:
            return None

        # Get the Instagram Business Account linked to the first page
        page_id = pages[0]["id"]
        resp = httpx.get(
            f"{GRAPH_API_BASE}/{page_id}",
            params={
                "fields": "instagram_business_account",
                "access_token": access_token,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return None

        ig_account = resp.json().get("instagram_business_account")
        return ig_account.get("id") if ig_account else None

    return await asyncio.to_thread(_fetch)


async def _get_public_video_url(video_path: Path) -> str:
    """
    Make the video accessible via a public URL.
    Uses file.io as a temporary file hosting service (auto-deletes after download).
    Falls back to a local server if file.io is unavailable.
    """
    import httpx

    def _upload():
        try:
            with open(video_path, "rb") as f:
                resp = httpx.post(
                    "https://file.io",
                    files={"file": (video_path.name, f, "video/mp4")},
                    timeout=120,
                )
            if resp.status_code == 200:
                data = resp.json()
                url = data.get("link")
                if url:
                    logger.info(f"Video uploaded to temporary URL: {url}")
                    return url
        except Exception as e:
            logger.warning(f"file.io upload failed: {e}")

        # Fallback: use transfer.sh
        try:
            with open(video_path, "rb") as f:
                resp = httpx.put(
                    f"https://transfer.sh/{video_path.name}",
                    content=f.read(),
                    headers={"Max-Days": "1"},
                    timeout=120,
                )
            if resp.status_code == 200:
                url = resp.text.strip()
                logger.info(f"Video uploaded to temporary URL: {url}")
                return url
        except Exception as e:
            logger.warning(f"transfer.sh upload failed: {e}")

        from backend.core.exceptions import UploadError
        raise UploadError(
            "Could not create a public URL for the video. "
            "Instagram requires a publicly accessible video URL for upload."
        )

    return await asyncio.to_thread(_upload)


async def _create_media_container(
    ig_user_id: str, video_url: str, caption: str, access_token: str
) -> str:
    """Create a media container for the Reel."""
    import httpx

    def _create():
        resp = httpx.post(
            f"{GRAPH_API_BASE}/{ig_user_id}/media",
            data={
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": access_token,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            from backend.core.exceptions import UploadError
            raise UploadError(f"Instagram container creation failed: {resp.text}")

        container_id = resp.json().get("id")
        if not container_id:
            from backend.core.exceptions import UploadError
            raise UploadError("Instagram API did not return a container ID")

        return container_id

    return await asyncio.to_thread(_create)


async def _wait_for_container(container_id: str, access_token: str, timeout_seconds: int = 120):
    """Poll until the media container is ready for publishing."""
    import httpx

    for _ in range(timeout_seconds // 5):
        def _check():
            resp = httpx.get(
                f"{GRAPH_API_BASE}/{container_id}",
                params={
                    "fields": "status_code",
                    "access_token": access_token,
                },
                timeout=10,
            )
            if resp.status_code != 200:
                return None
            return resp.json().get("status_code")

        status = await asyncio.to_thread(_check)

        if status == "FINISHED":
            return
        elif status == "ERROR":
            from backend.core.exceptions import UploadError
            raise UploadError("Instagram media processing failed")
        elif status in ("EXPIRED", None):
            from backend.core.exceptions import UploadError
            raise UploadError(f"Instagram media container expired or invalid (status={status})")

        await asyncio.sleep(5)

    from backend.core.exceptions import UploadError
    raise UploadError("Instagram media processing timed out")


async def _publish_container(ig_user_id: str, container_id: str, access_token: str) -> str:
    """Publish the processed media container."""
    import httpx

    def _publish():
        resp = httpx.post(
            f"{GRAPH_API_BASE}/{ig_user_id}/media_publish",
            data={
                "creation_id": container_id,
                "access_token": access_token,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            from backend.core.exceptions import UploadError
            raise UploadError(f"Instagram publish failed: {resp.text}")

        return resp.json().get("id", "")

    return await asyncio.to_thread(_publish)


async def _get_permalink(media_id: str, access_token: str) -> str:
    """Get the permalink for the published Reel."""
    import httpx

    def _fetch():
        resp = httpx.get(
            f"{GRAPH_API_BASE}/{media_id}",
            params={
                "fields": "permalink",
                "access_token": access_token,
            },
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json().get("permalink", "")
        return ""

    return await asyncio.to_thread(_fetch)


# ── Instagram OAuth & Token Management ───────────────────────────────────────

async def build_instagram_auth_url(client_id: str = None, redirect_uri: str = None) -> str:
    """Build Meta / Instagram Graph API OAuth authorization URL."""
    import urllib.parse
    from backend.config import settings
    from backend.core.service_keys import resolve_key
    from backend.core.exceptions import UploadAuthError

    cid = client_id or await resolve_key("instagram_client_id")
    red_uri = redirect_uri or settings.INSTAGRAM_REDIRECT_URI

    if not cid:
        raise UploadAuthError("Meta / Instagram App ID não configurado. Configure na seção Redes Sociais.")

    scopes = [
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
    ]
    params = {
        "client_id": cid,
        "redirect_uri": red_uri,
        "scope": ",".join(scopes),
        "response_type": "code",
        "state": "viralmint_instagram_auth",
    }
    return f"https://www.facebook.com/v19.0/dialog/oauth?{urllib.parse.urlencode(params)}"


async def get_instagram_account_details(access_token: str) -> dict:
    """Fetch Instagram Business/Creator Account linked to user's Facebook pages."""
    import httpx

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{GRAPH_API_BASE}/me/accounts",
                params={
                    "fields": "id,name,instagram_business_account{id,username,name}",
                    "access_token": access_token,
                },
            )
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                for page in data:
                    ig_acc = page.get("instagram_business_account")
                    if ig_acc and ig_acc.get("id"):
                        return {
                            "id": ig_acc["id"],
                            "username": ig_acc.get("username", ""),
                            "name": ig_acc.get("name", "") or page.get("name", ""),
                            "page_id": page.get("id"),
                        }
        except Exception as e:
            logger.warning(f"Error querying me/accounts for Instagram: {e}")

        try:
            resp = await client.get(
                f"{GRAPH_API_BASE}/me",
                params={"fields": "id,name,username", "access_token": access_token},
            )
            if resp.status_code == 200:
                user_data = resp.json()
                if user_data.get("id"):
                    return {
                        "id": user_data["id"],
                        "username": user_data.get("username", ""),
                        "name": user_data.get("name", ""),
                    }
        except Exception as e:
            logger.warning(f"Error querying me for Instagram: {e}")

    return {"id": "", "username": "", "name": ""}


async def exchange_instagram_code(code: str, client_id: str = None, client_secret: str = None, redirect_uri: str = None) -> dict:
    """Exchange authorization code for long-lived access token + IG account details."""
    import httpx
    from backend.config import settings
    from backend.core.service_keys import resolve_key
    from backend.core.exceptions import UploadAuthError

    cid = client_id or await resolve_key("instagram_client_id")
    csecret = client_secret or await resolve_key("instagram_client_secret")
    red_uri = redirect_uri or settings.INSTAGRAM_REDIRECT_URI

    if not cid or not csecret:
        raise UploadAuthError("Meta / Instagram App ID ou App Secret não configurados.")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{GRAPH_API_BASE}/oauth/access_token",
            params={
                "client_id": cid,
                "client_secret": csecret,
                "redirect_uri": red_uri,
                "code": code,
            },
        )
        if resp.status_code != 200:
            raise UploadAuthError(f"Falha ao trocar código de autorização Meta: {resp.text[:300]}")

        token_data = resp.json()
        short_token = token_data.get("access_token")
        if not short_token:
            raise UploadAuthError("Meta não retornou access_token no callback de autorização.")

        long_lived_token = short_token
        try:
            ll_resp = await client.get(
                f"{GRAPH_API_BASE}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": cid,
                    "client_secret": csecret,
                    "fb_exchange_token": short_token,
                },
            )
            if ll_resp.status_code == 200:
                long_lived_token = ll_resp.json().get("access_token", short_token)
        except Exception as e:
            logger.warning(f"Failed to exchange for long-lived Instagram token: {e}")

        acc_details = await get_instagram_account_details(long_lived_token)

        return {
            "access_token": long_lived_token,
            "ig_user_id": acc_details.get("id", ""),
            "account_name": acc_details.get("username") or acc_details.get("name") or "Instagram Business",
        }


async def verify_instagram_token(access_token: str, ig_user_id: str = None) -> dict:
    """Verify an Instagram Access Token and return account info."""
    import httpx

    if not access_token:
        return {"ok": False, "error": "Nenhum token fornecido"}

    async with httpx.AsyncClient(timeout=15) as client:
        if ig_user_id:
            try:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{ig_user_id}",
                    params={"fields": "id,username,name", "access_token": access_token},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "ok": True,
                        "ig_user_id": data.get("id"),
                        "account_name": data.get("username") or data.get("name") or ig_user_id,
                    }
            except Exception as e:
                logger.warning(f"Error checking ig_user_id {ig_user_id}: {e}")

        acc_details = await get_instagram_account_details(access_token)
        if acc_details.get("id"):
            return {
                "ok": True,
                "ig_user_id": acc_details["id"],
                "account_name": acc_details.get("username") or acc_details.get("name") or "Instagram Business",
            }

        try:
            resp = await client.get(
                f"{GRAPH_API_BASE}/me",
                params={"fields": "id,name", "access_token": access_token},
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "ok": True,
                    "ig_user_id": data.get("id"),
                    "account_name": data.get("name") or "Meta Account",
                }
            else:
                err = resp.json().get("error", {}).get("message", resp.text[:200])
                return {"ok": False, "error": f"Token inválido: {err}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
