"""Discord slash-command adapter for the shared Frieren Neural API."""

from __future__ import annotations

import os
import time
from urllib.parse import urlparse

import aiohttp
import discord
from discord import app_commands


DISCORD_MESSAGE_LIMIT = 1_900


def extract_answer(payload: object, prompt: str) -> str | None:
    """Prefer the completion-only API field and safely support older prompt-prefixed responses."""
    if not isinstance(payload, dict):
        return None
    answer = payload.get("completion")
    if not isinstance(answer, str) or not answer.strip():
        answer = payload.get("text")
        if not isinstance(answer, str):
            return None
        if answer.startswith(prompt):
            answer = answer[len(prompt):]
    answer = answer.strip()
    return answer or None


def split_message(text: str, *, limit: int = DISCORD_MESSAGE_LIMIT) -> list[str]:
    """Split long output without losing characters or exceeding Discord limits."""
    if limit < 1:
        raise ValueError("limit must be positive.")
    chunks: list[str] = []
    remaining = text
    while len(remaining) > limit:
        boundary = remaining.rfind("\n", 0, limit + 1)
        if boundary <= 0:
            boundary = remaining.rfind(" ", 0, limit + 1)
        if boundary <= 0:
            boundary = limit
        else:
            boundary += 1
        chunks.append(remaining[:boundary])
        remaining = remaining[boundary:]
    if remaining:
        chunks.append(remaining)
    return chunks


class FrierenDiscordClient(discord.Client):
    """A minimal bot that forwards prompts to the authenticated shared API."""

    def __init__(self, *, api_url: str, api_token: str, guild_id: int | None = None) -> None:
        super().__init__(intents=discord.Intents.none())
        self.tree = app_commands.CommandTree(self)
        self.api_url = api_url.rstrip("/") + "/generate"
        self.api_token = api_token
        self.guild_id = guild_id
        self.session: aiohttp.ClientSession | None = None
        self._last_requests: dict[int, float] = {}

        async def ask(
            interaction: discord.Interaction,
            prompt: app_commands.Range[str, 1, 1_500],
        ) -> None:
            await self._ask(interaction, prompt)

        self.tree.add_command(
            app_commands.Command(
                name="ask",
                description="Ask Frieren AI a question.",
                callback=ask,
            )
        )

    async def setup_hook(self) -> None:
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=75),
            headers={"Authorization": f"Bearer {self.api_token}"},
        )
        if self.guild_id is not None:
            guild = discord.Object(id=self.guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()

    async def close(self) -> None:
        if self.session is not None and not self.session.closed:
            await self.session.close()
        await super().close()

    async def _ask(self, interaction: discord.Interaction, prompt: str) -> None:
        user_id = interaction.user.id
        now = time.monotonic()
        previous = self._last_requests.get(user_id, 0.0)
        if now - previous < 5.0:
            await interaction.response.send_message("Please wait a few seconds before asking again.", ephemeral=True)
            return
        self._last_requests[user_id] = now
        if len(self._last_requests) > 5_000:
            self._last_requests = {
                user: timestamp for user, timestamp in self._last_requests.items()
                if now - timestamp < 60.0
            }
        await interaction.response.defer(thinking=True)
        if self.session is None:
            await interaction.followup.send("Frieren AI API is not ready.")
            return
        try:
            async with self.session.post(
                self.api_url,
                json={"prompt": prompt, "max_new_tokens": 256, "temperature": 0.3, "top_k": 40},
            ) as response:
                if response.status != 200:
                    await interaction.followup.send("Frieren AI could not process the request right now.")
                    return
                payload = await response.json()
            answer = extract_answer(payload, prompt)
            if answer is None:
                await interaction.followup.send("Frieren AI returned an empty response.")
                return
            for chunk in split_message(answer):
                await interaction.followup.send(
                    chunk,
                    allowed_mentions=discord.AllowedMentions.none(),
                )
        except (aiohttp.ClientError, TimeoutError, ValueError):
            await interaction.followup.send("Frieren AI API is temporarily unavailable.")


def main() -> None:
    discord_token = os.environ.get("FRIEREN_DISCORD_TOKEN", "")
    api_token = os.environ.get("FRIEREN_API_TOKEN", "")
    api_url = os.environ.get("FRIEREN_API_URL", "http://127.0.0.1:8000")
    if not discord_token:
        raise RuntimeError("FRIEREN_DISCORD_TOKEN is required.")
    if len(api_token) < 32:
        raise RuntimeError("FRIEREN_API_TOKEN must contain at least 32 characters.")
    parsed_url = urlparse(api_url)
    if not parsed_url.hostname or (parsed_url.scheme != "https" and parsed_url.hostname not in {"localhost", "127.0.0.1"}):
        raise RuntimeError("FRIEREN_API_URL must use HTTPS outside localhost.")
    guild_value = os.environ.get("FRIEREN_DISCORD_GUILD_ID")
    guild_id = int(guild_value) if guild_value else None
    client = FrierenDiscordClient(api_url=api_url, api_token=api_token, guild_id=guild_id)
    client.run(discord_token)


if __name__ == "__main__":
    main()
