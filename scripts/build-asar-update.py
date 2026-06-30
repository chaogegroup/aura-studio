import subprocess, os, shutil, tempfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp(prefix='asar_')

os.makedirs(os.path.join(tmp, 'frontend-dist'), exist_ok=True)
os.makedirs(os.path.join(tmp, 'node_modules'), exist_ok=True)
os.makedirs(os.path.join(tmp, 'electron'), exist_ok=True)

# Copy app files
shutil.copytree(os.path.join(root, 'frontend-dist'), os.path.join(tmp, 'frontend-dist'), dirs_exist_ok=True)
shutil.copytree(os.path.join(root, 'electron'), os.path.join(tmp, 'electron'), dirs_exist_ok=True)
shutil.copy2(os.path.join(root, 'package.json'), os.path.join(tmp, 'package.json'))

# Copy electron-updater and all its deps
nm_root = os.path.join(root, 'node_modules')
deps_to_copy = ['electron-updater', 'builder-util-runtime', 'graceful-fs', 'semver']
for dep in deps_to_copy:
    src = os.path.join(nm_root, dep)
    dst = os.path.join(tmp, 'node_modules', dep)
    if os.path.exists(src):
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)
        print(f'  copied: {dep}')

# also check for any extra deps that electron-updater needs
extra = ['js-yaml', 'lazy-val', 'source-map-support', 'buffer-from']
for dep in extra:
    src = os.path.join(nm_root, dep)
    dst = os.path.join(tmp, 'node_modules', dep)
    if os.path.exists(src) and os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)
        print(f'  copied (extra): {dep}')

# Pack asar
asar_path = os.path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')
result = subprocess.run(['npx', 'asar', 'pack', tmp, asar_path], capture_output=True, text=True, shell=True)
print(f'pack: exit={result.returncode}')

# Verify
result = subprocess.run(['npx', 'asar', 'list', asar_path], capture_output=True, text=True, shell=True)
lines = [l for l in result.stdout.strip().split('\n') if l.strip()]
print(f'total files in asar: {len(lines)}')

# Update unpacked electron files
dst_el = os.path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar.unpacked', 'electron')
shutil.copy2(os.path.join(root, 'electron', 'main.js'), os.path.join(dst_el, 'main.js'))
shutil.copy2(os.path.join(root, 'electron', 'preload.js'), os.path.join(dst_el, 'preload.js'))
print('unpacked files updated')

shutil.rmtree(tmp, ignore_errors=True)
print('Done')
