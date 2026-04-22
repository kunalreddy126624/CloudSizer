# Noodle Test Matrix

This matrix covers the Noodle module at three levels: unit-ish control-plane/runtime tests, API-level end-to-end tests, and topology-focused pytest cases.

## Runtime Topologies

| Scenario | Coverage |
| --- | --- |
| Single source -> single target | `tests/test_noodle_topologies_pytest.py::test_single_source_single_target_topology` |
| Multi source -> single target | `tests/test_noodle_topologies_pytest.py::test_multi_source_single_target_topology` |
| Single source -> multi target | `tests/test_noodle_topologies_pytest.py::test_single_source_multi_target_topology` |
| Multi source -> multi target | `tests/test_noodle_topologies_pytest.py::test_multi_source_multi_target_topology` |
| Mixed cache + sink terminals | `tests/test_noodle_e2e_pytest.py::test_noodle_pipeline_end_to_end_with_cache_and_sink_terminals` |

## API End-to-End

| Scenario | Coverage |
| --- | --- |
| Save pipeline via `/noodle/pipelines` | `tests/test_noodle_e2e_pytest.py` |
| Run pipeline via `/noodle/pipelines/{pipeline_id}/runs` | `tests/test_noodle_e2e_pytest.py` |
| Verify persisted sink outputs | `tests/test_noodle_e2e_pytest.py` |
| Verify cached output records on run payload | `tests/test_noodle_e2e_pytest.py` |

## Existing Noodle Coverage

| Area | Coverage |
| --- | --- |
| Planner, blueprint, connector catalog, governance scaffold | `tests/test_noodle_orchestrator.py` |
| Runtime adapters, sink contracts, repair flows, batch resume | `tests/test_noodle_pipeline_control_plane.py` |
| RAG, agent recovery, Momo guidance style | `tests/test_noodle_rag.py` |

## Recommended Command

```bash
python -m pytest tests -q -k noodle
```
