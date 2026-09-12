"""Lambda-only package initializer for the xLSTM inference image.

The upstream initializer eagerly imports the similarity algorithm, which pulls
the full Statcast analytics dependency graph into every xLSTM cold start. The
Lambda image only invokes ``pitchpredict.backend.algs.xlstm`` through the app's
narrow adapter, so its package initializer should stay side-effect free.
"""

from pitchpredict.backend.algs.base import PitchPredictAlgorithm

__all__ = ["PitchPredictAlgorithm"]
