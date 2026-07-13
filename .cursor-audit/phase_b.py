"""
Phase B — Go module path rename
github.com/utmstack/UTMStack → github.com/encryptshellorg/nilachakra

Rules:
- SKIP: github.com/utmstack/config-client-go (external lib, not ours)
- SKIP: ghcr.io/utmstack/utmstack (container registry, separate Phase)
- DO: all internal import paths and module declarations
- DO: proto go_package options
- DO: GitHub Actions workflow references to the module path
- DO NOT: binary names like com.utmstack.*.plugin (frozen per steering file)
- DO NOT: deployed paths/filenames
"""
import os, sys
from pathlib import Path

ROOT = '/Users/encryptshell/GIT/UTMStack-11'
OLD = b'github.com/utmstack/UTMStack'
NEW = b'github.com/encryptshellorg/nilachakra'

# These are external packages we depend on — do NOT rename
SKIP_PATTERNS = [
    b'github.com/utmstack/config-client-go',
    b'ghcr.io/utmstack',
    b'ghcr.io/',
]

def safe_replace(content, old, new, skip_patterns):
    """Replace old→new but only when not part of a skip pattern."""
    result = b''
    i = 0
    while i < len(content):
        if content[i:i+len(old)] == old:
            # Check if this match is part of a skip pattern
            skip = False
            for sp in skip_patterns:
                # Check if old is a prefix of sp at this position
                end = i + len(sp)
                if content[i:end] == sp[:end-i] and content[i:i+len(sp)] == sp:
                    skip = True
                    break
            if skip:
                result += content[i:i+1]
                i += 1
            else:
                result += new
                i += len(old)
        else:
            result += content[i:i+1]
            i += 1
    return result

def process_file(path):
    try:
        with open(path, 'rb') as f:
            original = f.read()
    except Exception as e:
        return 0, str(e)
    
    if OLD not in original:
        return 0, None
    
    # Count occurrences that are NOT in skip patterns
    count_before = original.count(OLD)
    
    # Do the replacement
    new_content = safe_replace(original, OLD, NEW, SKIP_PATTERNS)
    
    if new_content == original:
        return 0, None
    
    count_after = new_content.count(OLD)
    replaced = count_before - count_after
    
    # Write atomically
    tmp = path + '.new'
    with open(tmp, 'wb') as f:
        f.write(new_content)
    os.replace(tmp, path)
    return replaced, None

print(f'Phase B: Renaming {OLD.decode()} → {NEW.decode()}')
print(f'Skipping: {[p.decode() for p in SKIP_PATTERNS]}\n')

total_files = 0
total_replacements = 0
errors = []

# Walk the entire repo
for dirpath, dirs, files in os.walk(ROOT):
    # Skip non-source directories
    dirs[:] = [d for d in dirs if d not in [
        '.git', 'node_modules', 'vendor', 'target', 'dist', '.kiro',
        '.cursor-audit', '__pycache__'
    ]]
    
    for fname in files:
        # Only process Go, proto, YAML, and Dockerfile files
        ext = os.path.splitext(fname)[1].lower()
        if ext not in ['.go', '.mod', '.sum', '.proto', '.yml', '.yaml'] \
           and fname not in ['Dockerfile', 'Dockerfile.dev', 'Dockerfile.prod']:
            continue
        
        path = os.path.join(dirpath, fname)
        n, err = process_file(path)
        if err:
            errors.append(f'{path}: {err}')
        elif n > 0:
            total_files += 1
            total_replacements += n
            rel = path.replace(ROOT + '/', '')
            print(f'  ✅ {rel}: {n} replacements')

print(f'\n=== Summary ===')
print(f'Files modified: {total_files}')
print(f'Total replacements: {total_replacements}')
if errors:
    print(f'Errors: {len(errors)}')
    for e in errors:
        print(f'  ❌ {e}')

# Verify no old path remains (except external lib)
print('\n=== Verification ===')
import subprocess
r = subprocess.run(
    ['grep', '-rn', OLD.decode(),
     '--include=*.go', '--include=*.mod', '--include=*.proto', '--include=*.yml',
     ROOT],
    capture_output=True, text=True
)
remaining = [l for l in r.stdout.strip().split('\n')
             if l and '.git/' not in l
             and 'config-client-go' not in l
             and 'ghcr.io' not in l
             and '#' not in l.split(':',2)[-1][:5]  # skip comments in YAML
            ]
print(f'Remaining references (excluding external lib + registry + comments): {len(remaining)}')
for l in remaining[:10]:
    print(f'  {l.replace(ROOT+"/","")[:120]}')
