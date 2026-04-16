from typing import List, Optional
import requests

from .base import EmbeddingProvider


class BigModelEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str, base_url: str, model_name: str, dimensions: Optional[int] = None):
        super().__init__("bigmodel", model_name, dimensions)
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        payload = {
            "model": self.model_name,
            "input": texts,
        }
        if self.dimensions:
            payload["dimensions"] = self.dimensions

        response = requests.post(
            f"{self.base_url}/embeddings",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json().get("data", [])
        return [item["embedding"] for item in data]
