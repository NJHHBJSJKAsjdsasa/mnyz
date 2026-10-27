# pymodules/__atlas_redis_cache.py

try:
    import redis
except ImportError:
    # Redis is an optional accelerator: Atlas runs without it.
    redis = None

import os
import json
import time
from typing import Optional, Any

class RedisCacheManager:
    def __init__(self):
        self.redis_client = None
        self._connect()

    def _build_client(self):
        """Honour ATLAS_REDIS_URL (or REDIS_URL), else the usual host/port vars."""
        url = os.getenv("ATLAS_REDIS_URL") or os.getenv("REDIS_URL")
        if url:
            return redis.Redis.from_url(url, decode_responses=True)

        return redis.Redis(
            host=os.getenv("ATLAS_REDIS_HOST", "localhost"),
            port=int(os.getenv("ATLAS_REDIS_PORT", "6379")),
            db=int(os.getenv("ATLAS_REDIS_DB", "0")),
            password=os.getenv("ATLAS_REDIS_PASSWORD") or None,
            decode_responses=True,
        )

    def _connect(self):
        if redis is None:
            return
        try:
            self.redis_client = self._build_client()
            # Test connection
            self.redis_client.ping()
        except Exception as e:
            print(f"Redis cache unavailable: {e}")
            self.redis_client = None

    def is_available(self) -> bool:
        return self.redis_client is not None

    def set(self, key: str, value: Any, expire_seconds: int = 3600) -> bool:
        if not self.is_available():
            return False

        try:
            serialized_value = json.dumps(value)
            self.redis_client.setex(key, expire_seconds, serialized_value)
            return True
        except Exception as e:
            print(f"Redis set error: {e}")
            return False

    def get(self, key: str) -> Optional[Any]:
        if not self.is_available():
            return None

        try:
            serialized_value = self.redis_client.get(key)
            if serialized_value:
                return json.loads(serialized_value)
            return None
        except Exception as e:
            print(f"Redis get error: {e}")
            return None

    def delete(self, key: str) -> bool:
        if not self.is_available():
            return False

        try:
            self.redis_client.delete(key)
            return True
        except Exception as e:
            print(f"Redis delete error: {e}")
            return False

    def exists(self, key: str) -> bool:
        if not self.is_available():
            return False

        try:
            return bool(self.redis_client.exists(key))
        except Exception as e:
            print(f"Redis exists error: {e}")
            return False

    def set_with_tags(self, key: str, value: Any, tags: list, expire_seconds: int = 3600) -> bool:
        if not self.is_available():
            return False

        try:
            # Set the value
            if not self.set(key, value, expire_seconds):
                return False

            # Add key to each tag set
            for tag in tags:
                tag_key = f"tag:{tag}"
                self.redis_client.sadd(tag_key, key)
                # Set expiration for tag set (optional)
                self.redis_client.expire(tag_key, expire_seconds)

            return True
        except Exception as e:
            print(f"Redis set_with_tags error: {e}")
            return False

    def delete_by_tag(self, tag: str) -> int:
        if not self.is_available():
            return 0

        try:
            tag_key = f"tag:{tag}"
            keys = self.redis_client.smembers(tag_key)
            if not keys:
                return 0

            # Delete all keys in the tag
            deleted = self.redis_client.delete(*keys)
            # Delete the tag set itself
            self.redis_client.delete(tag_key)
            return deleted
        except Exception as e:
            print(f"Redis delete_by_tag error: {e}")
            return 0

# Create a global instance
redis_cache = RedisCacheManager()
