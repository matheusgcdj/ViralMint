# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Re-export crypto module for backwards compatibility."""
from backend.core.crypto import encrypt, decrypt, decrypt_safe, DecryptionError

__all__ = ["encrypt", "decrypt", "decrypt_safe", "DecryptionError"]
