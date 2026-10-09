"""Keep offline reports and synthetic evidence beside the built React application."""
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
for p in (ROOT/'docs').iterdir():
 target=ROOT/'site-dist'/('legacy.html' if p.name=='index.html' else p.name)
 if p.is_dir():shutil.copytree(p,target,dirs_exist_ok=True)
 else:shutil.copyfile(p,target)
print('Packaged React app, offline report, three synthetic cases and evidence.')
