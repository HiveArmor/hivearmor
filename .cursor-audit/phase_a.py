import os

ROOT = '/Users/encryptshell/GIT/UTMStack-11'

def replace_in_file(path, replacements):
    if not os.path.exists(path):
        print(f'  SKIP: {path}')
        return 0
    with open(path, 'rb') as f:
        content = f.read()
    changed = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            changed += 1
    if changed:
        tmp = path + '.new'
        with open(tmp, 'wb') as f:
            f.write(content)
        os.replace(tmp, path)
    return changed

print('=== Phase A — No-Blocker Rebrand Changes ===\n')

# A1: Javadoc comments in opensearch classes
print('A1: Java Javadoc comments...')
opensearch_comment_files = [
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/parsers/DateHistogramAggregateParser.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/parsers/TermAggregateParser.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/types/BucketAggregation.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/types/ElasticCluster.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/types/SqlQueryRequest.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/types/SearchSqlResponse.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/types/IndexSort.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/enums/IndexSortableProperty.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/enums/HttpScheme.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/enums/HttpMethod.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/enums/TermOrder.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/OpenSearch.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/opensearch/exceptions/OpenSearchException.java',
    f'{ROOT}/backend/src/main/java/com/nilachakra/UtmstackApp.java',
]
for path in opensearch_comment_files:
    n = replace_in_file(path, [
        (b'com.utmstack.opensearch_connector', b'com.nilachakra.opensearch_connector'),
        (b'Initializes utmstack', b'Initializes nilachakra'),
        (b'Replaces com.utmstack', b'Replaces com.nilachakra'),
    ])
    if n: print(f'  ✅ {os.path.basename(path)}')

# A2: AsyncConfiguration thread prefix
print('A2: Thread prefix...')
n = replace_in_file(
    f'{ROOT}/backend/src/main/java/com/nilachakra/config/AsyncConfiguration.java',
    [(b'"utmstack-Executor-"', b'"nilachakra-Executor-"')]
)
print(f'  {"✅" if n else "—"} AsyncConfiguration.java')

# A3: application.yml scheduling thread prefix
print('A3: application.yml thread prefix...')
n = replace_in_file(
    f'{ROOT}/backend/src/main/resources/config/application.yml',
    [(b'utmstack-api-scheduling-', b'nilachakra-api-scheduling-')]
)
print(f'  {"✅" if n else "—"} application.yml')

# A4: Correlation rules YAML — display name/description only
print('A4: Correlation rules YAML...')
rules_root = f'{ROOT}/rules'
rules_changed = 0
for dirpath, dirnames, files in os.walk(rules_root):
    for fname in files:
        if not fname.endswith('.yml'):
            continue
        path = os.path.join(dirpath, fname)
        with open(path, 'rb') as f:
            original = f.read()
        lines = original.decode('utf-8', 'replace').split('\n')
        new_lines = []
        changed_this = 0
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('name:') or stripped.startswith('description:') or stripped.startswith('#'):
                new_line = line.replace('UTMStack', 'NilaChakra').replace('utmstack', 'nilachakra')
                if new_line != line: changed_this += 1
            else:
                new_line = line
            new_lines.append(new_line)
        if changed_this:
            tmp = path + '.new'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write('\n'.join(new_lines))
            os.replace(tmp, path)
            rules_changed += 1
print(f'  ✅ {rules_changed} rule files updated')

# A5: Installer display strings (not binary names)
print('A5: Installer display strings...')
n = replace_in_file(f'{ROOT}/installer/main.go', [
    (b'error installing UTMStack:', b'error installing NilaChakra:'),
    (b'error getting UTMStack version:', b'error getting NilaChakra version:'),
    (b'UTMStack version:', b'NilaChakra version:'),
    (b'error uninstalling UTMStack:', b'error uninstalling NilaChakra:'),
])
print(f'  {"✅" if n else "—"} installer/main.go')

# A6: Shell scripts comments/display
print('A6: Shell scripts...')
for fname in ['.github/scripts/ai-review.sh', '.github/scripts/approver.sh',
              '.github/scripts/generate-changelog.sh', '.github/scripts/go-deps.sh']:
    path = f'{ROOT}/{fname}'
    if not os.path.exists(path): continue
    with open(path, 'rb') as f:
        content = f.read()
    if b'utmstack' not in content.lower(): continue
    lines = content.decode('utf-8', 'replace').split('\n')
    new_lines = []
    changed = 0
    for line in lines:
        s = line.strip()
        if s.startswith('#') or 'echo' in s.lower() or 'printf' in s.lower() or 'description' in s.lower():
            nl = line.replace('UTMStack', 'NilaChakra').replace('utmstack', 'nilachakra')
            if nl != line: changed += 1
        else:
            nl = line
        new_lines.append(nl)
    if changed:
        tmp = path + '.new'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
        os.replace(tmp, path)
        print(f'  ✅ {fname}: {changed} lines')

# A7: Go collector display text (not binary names, not module paths)
print('A7: Go display strings...')
collector_main = f'{ROOT}/utmstack-collector/main.go'
n = replace_in_file(collector_main, [
    (b'debug UTMStack installation', b'debug NilaChakra installation'),
    (b'debug UTMStack', b'debug NilaChakra'),
])
if n: print(f'  ✅ utmstack-collector/main.go')

# A8: GitHub Actions signing workflow default URL
print('A8: GitHub Actions display strings...')
n = replace_in_file(f'{ROOT}/.github/workflows/reusable-sign-agent.yml', [
    (b'default: "https://utmstack.com"', b'default: "https://nilachakra.com"'),
    (b"default: 'https://utmstack.com'", b"default: 'https://nilachakra.com'"),
])
if n: print(f'  ✅ reusable-sign-agent.yml')

# A9: AGENTS.md — update rebrand status
print('A9: AGENTS.md...')
n = replace_in_file(f'{ROOT}/AGENTS.md', [
    (b'Backend Java package + Go module rename pending (see `REBRAND_NILACHAKRA_PLAN.md`)',
     b'Backend Java package rename DONE (com.nilachakra). Go module rename pending (needs GitHub org).'),
])
if n: print(f'  ✅ AGENTS.md')

# A10: ModuleSocAi.java — the socai config keys are DB keys but let's check if they're display too
# These are DB config key NAMES used as constants — need Phase C (DB update first)
# Skipping intentionally

print('\n=== Verification ===')
import subprocess
r = subprocess.run(['grep','-rc','utmstack',
    f'{ROOT}/backend/src/main/java/com/nilachakra',
    '--include=*.java'], capture_output=True, text=True)
remaining_files = [l for l in r.stdout.strip().split('\n') if l and not l.endswith(':0')]
print(f'Java files with remaining utmstack refs: {len(remaining_files)}')
for l in remaining_files[:8]:
    fname = l.split('nilachakra/')[-1].split(':')[0]
    count = l.split(':')[-1]
    print(f'  {fname}: {count}')
