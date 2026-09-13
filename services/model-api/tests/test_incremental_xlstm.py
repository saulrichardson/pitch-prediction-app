import pytest
import torch
from pitchpredict.backend.algs.xlstm.model import ModelConfig, PackedPitchContext, build_model
from pitchpredict.backend.algs.xlstm.predictor import GenerationConfig, generate_pitches
from pitchpredict.backend.algs.xlstm.sequence import ContextDefaults, build_history_sequence, contexts_to_packed

from pitch_model_api.incremental_xlstm import IncrementalPitchDecoder, IncrementalXlstmAlgorithm


@pytest.fixture
def model():
    torch.manual_seed(17)
    return build_model(ModelConfig(d_model=32, num_blocks=2, num_heads=2)).eval()


def inputs(batch, length):
    sequence = build_history_sequence([], ContextDefaults(pitcher_id=477132, batter_id=592450))
    packed = contexts_to_packed([sequence.contexts[0]] * length, torch.device('cpu'))
    context = PackedPitchContext(*(x.expand(batch, -1).clone() for x in packed))
    # Exercise changing context, including the transition to a new plate appearance.
    context.count_balls[:, length // 2:] = 2
    context.pitch_number[:] = torch.arange(1, length + 1)
    tokens = torch.randint(0, 240, (batch, length))
    return tokens, context


@pytest.mark.parametrize('batch,prefix', [(1, 2), (3, 20), (8, 82)])
def test_every_generated_position_matches_the_full_history_model(model, batch, prefix):
    tokens, context = inputs(batch, prefix + 15)
    decoder = IncrementalPitchDecoder(model).eval()
    with torch.no_grad():
        for length in range(prefix, prefix + 16):
            current = PackedPitchContext(*(x[:, :length] for x in context))
            expected = model(tokens[:, :length], current)[:, -1:]
            actual = decoder(tokens[:, :length], current)
            torch.testing.assert_close(actual, expected, atol=2e-5, rtol=2e-5)


def test_sampling_and_grammar_remain_upstream_and_reproducible(model):
    sequence = build_history_sequence([], ContextDefaults(pitcher_id=477132, batter_id=592450))
    packed = contexts_to_packed(sequence.contexts, torch.device('cpu'))
    arguments = dict(history_tokens=sequence.tokens, history_context=packed,
                     config=GenerationConfig(sample_size=8), device=torch.device('cpu'))
    torch.manual_seed(44)
    expected = generate_pitches(model, **arguments)
    torch.manual_seed(44)
    actual = generate_pitches(IncrementalPitchDecoder(model), **arguments)
    assert actual.generated_tokens == expected.generated_tokens
    assert actual.decoded_pitches == expected.decoded_pitches
    assert actual.pitch_type_probs == pytest.approx(expected.pitch_type_probs, abs=1e-6)


def test_decoders_do_not_share_request_state_or_change_weights(model):
    algorithm = IncrementalXlstmAlgorithm()
    algorithm._model, algorithm._device = model, torch.device('cpu')
    first, _ = algorithm._ensure_model_loaded()
    second, _ = algorithm._ensure_model_loaded()
    assert first is not second
    assert first.model is second.model is model
    weights = {name: value.clone() for name, value in model.state_dict().items()}
    tokens, context = inputs(2, 8)
    other_tokens, other_context = inputs(1, 12)
    first.eval()
    second.eval()
    with torch.no_grad():
        first(tokens, context)
        actual = second(other_tokens, other_context)
        torch.testing.assert_close(actual, model(other_tokens, other_context)[:, -1:], atol=2e-5, rtol=2e-5)
    for name, value in model.state_dict().items():
        assert torch.equal(value, weights[name])


@pytest.mark.parametrize('change', ['tokens', 'context', 'length'])
def test_decoder_rejects_a_reused_or_changed_prefix(model, change):
    tokens, context = inputs(1, 6)
    decoder = IncrementalPitchDecoder(model).eval()
    with torch.no_grad():
        decoder(tokens[:, :5], PackedPitchContext(*(x[:, :5] for x in context)))
        if change == 'tokens':
            tokens[0, 0] = (tokens[0, 0] + 1) % 240
        elif change == 'context':
            context.count_balls[0, 0] = 3
        else:
            tokens = tokens[:, :5]
        with pytest.raises(ValueError, match='append exactly one|change its history'):
            decoder(tokens, context)
