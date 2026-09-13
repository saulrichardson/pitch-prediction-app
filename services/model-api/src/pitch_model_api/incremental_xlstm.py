"""Request-scoped decoding for the pinned pitchpredict 0.5.0 xLSTM.

The upstream generator calls the model with the whole growing sequence for
each of a pitch's 16 tokens. Keep its grammar, sampling and weights, but reuse
the recurrent layer states within that one prediction. No state crosses requests.
"""

from __future__ import annotations

import torch
from pitchpredict.backend.algs.xlstm.base import XlstmAlgorithm
from pitchpredict.backend.algs.xlstm.model import BaseballxLSTM, MState, PackedPitchContext, softcap


class IncrementalPitchDecoder(torch.nn.Module):
    """Expose last-position logits to the upstream autoregressive generator."""

    def __init__(self, model: BaseballxLSTM) -> None:
        super().__init__()
        self.model = model
        self.vocab_size = model.vocab_size
        self._states: tuple[MState, ...] | None = None
        self._tokens: torch.Tensor | None = None
        self._context: PackedPitchContext | None = None

    def forward(self, tokens: torch.Tensor, context: PackedPitchContext) -> torch.Tensor:
        if self.training:
            raise ValueError("Incremental pitch decoding requires evaluation mode.")
        if self._tokens is not None:
            if tokens.shape != (self._tokens.shape[0], self._tokens.shape[1] + 1):
                raise ValueError("A decoding step must append exactly one token.")
            if not torch.equal(tokens[:, :-1], self._tokens) or any(
                not torch.equal(current[:, :-1], previous)
                for current, previous in zip(context, self._context, strict=True)
            ):
                raise ValueError("A decoding step cannot change its history.")

        next_tokens = tokens if self._states is None else tokens[:, -1:]
        next_context = context if self._states is None else PackedPitchContext(*(x[:, -1:] for x in context))
        x = self.model.fusion(self.model.token_embed(next_tokens), self.model.context_adapter(next_context))
        states = []
        for index, block in enumerate(self.model.blocks):
            normalized = block.pre1(x)
            layer = block.seqmix
            if self._states is None:
                mixed, state = layer(normalized)
            else:
                batch, length, _ = normalized.shape
                qkv = layer.proj_qkv(normalized).view(
                    batch, length, layer.H, 2 * layer.dqk + layer.dhv
                ).transpose(1, 2)
                ifo = layer.proj_ifo(normalized).view(
                    batch, length, layer.H, layer.dhv + 2
                ).transpose(1, 2)
                # Reuse the pinned implementation's chunk kernel, including its
                # normalization order; its separate cell.step is not equivalent.
                mixed, state = layer._chunk_parallel(
                    qkv[..., :layer.dqk],
                    qkv[..., layer.dqk:2 * layer.dqk],
                    qkv[..., 2 * layer.dqk:],
                    torch.sigmoid(ifo[..., :layer.dhv]),
                    ifo[..., layer.dhv],
                    ifo[..., layer.dhv + 1],
                    self._states[index],
                )
                mixed = layer.out_proj(mixed)
            z = x + block.drop(mixed)
            x = z + block.drop(block.ff(block.pre2(z)))
            states.append(state)

        logits = self.model.lm_head(self.model.norm_out(x[:, -1:]))
        if self.model.logits_softcap is not None and self.model.logits_softcap > 0:
            logits = softcap(logits, self.model.logits_softcap)
        self._states = tuple(states)
        self._tokens = tokens.detach().clone()
        self._context = PackedPitchContext(*(x.detach().clone() for x in context))
        return logits


class IncrementalXlstmAlgorithm(XlstmAlgorithm):
    def _ensure_model_loaded(self):
        model, device = super()._ensure_model_loaded()
        # The base algorithm owns shared, read-only weights. Every prediction
        # receives a fresh decoder, including concurrent calls and warmup.
        return IncrementalPitchDecoder(model), device
