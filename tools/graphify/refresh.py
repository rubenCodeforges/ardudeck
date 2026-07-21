"""ArduDeck knowledge-graph refresh (invoked by refresh.sh under PYTHONHASHSEED=0).

Incremental AST re-extract of a scope dir, reuses curated community names via the sig
sidecar, regenerates graph.json + GRAPH_REPORT.md + graph.html. The __main__ guard is
REQUIRED: graphify's extractor spawns worker processes that re-import this module.
"""
import json
import sys
from pathlib import Path


def main(scope: str) -> None:
    from graphify.detect import detect
    from graphify.extract import extract
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all, community_member_sigs, label_communities_by_hub
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.report import generate
    from graphify.export import to_json, to_html

    out = Path('graphify-out'); out.mkdir(exist_ok=True)

    # 1. detect + filter (drop tests, bundled public JS, data json, config js)
    d = detect(Path(scope))
    def keep(p):
        p = p.replace('\\', '/')
        if '/public/' in p or '/testing/' in p:
            return False
        if p.endswith(('.test.ts', '.test.tsx', '.json', '.js', '.mjs')):
            return False
        return True
    code = [Path(p) for p in d.get('files', {}).get('code', []) if keep(p)]

    # 2. incremental AST extract (cache_root enables the on-disk cache)
    ex = extract(code, cache_root=Path(scope))
    (out / '.graphify_extract.json').write_text(json.dumps(ex, ensure_ascii=False), encoding='utf-8')

    # 3. build + deterministic cluster
    G = build_from_json(ex, root=scope, directed=False)
    comm = cluster(G)
    cur_sigs = community_member_sigs(comm)

    # 4. reuse curated labels for unchanged communities; hub-name changed/new ones
    lp = out / '.graphify_labels.json'; sp = out / '.graphify_labels.json.sig'
    saved_labels = {int(k): v for k, v in json.loads(lp.read_text()).items()} if lp.exists() else {}
    saved_sigs = {int(k): v for k, v in json.loads(sp.read_text()).items()} if sp.exists() else {}
    hub = None; labels = {}; renamed = 0
    for cid in comm:
        if cid in saved_labels and saved_sigs.get(cid) == cur_sigs.get(cid):
            labels[cid] = saved_labels[cid]
        else:
            if hub is None:
                hub = label_communities_by_hub(G, comm)
            labels[cid] = hub[cid]
            if cid in saved_labels:
                renamed += 1

    # 5. write all outputs + refresh the sidecars
    coh = score_all(G, comm); gods = god_nodes(G); surp = surprising_connections(G, comm)
    q = suggest_questions(G, comm, labels)
    to_json(G, comm, str(out / 'graph.json'), force=True, community_labels=labels)
    (out / 'GRAPH_REPORT.md').write_text(
        generate(G, comm, coh, labels, gods, surp, d, {'input': 0, 'output': 0}, scope, suggested_questions=q),
        encoding='utf-8')
    to_html(G, comm, str(out / 'graph.html'), community_labels=labels,
            member_counts={c: len(m) for c, m in comm.items()}, node_limit=5000)
    lp.write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding='utf-8')
    sp.write_text(json.dumps({str(k): v for k, v in cur_sigs.items()}), encoding='utf-8')

    tail = (f' | {renamed} changed cluster(s) hub-named - run /graphify label to name them properly'
            if renamed else ' | all names reused')
    print(f'graph refreshed: {G.number_of_nodes()} nodes, {len(comm)} communities' + tail)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'apps/desktop/src')
