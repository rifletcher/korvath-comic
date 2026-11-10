import glob, os, time

files = sorted(glob.glob('02_Assets/episode_01_build/audio/*'))
for f in files:
    mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(f)))
    print(f'{os.path.basename(f):35} {os.path.getsize(f):8} {mtime}')

