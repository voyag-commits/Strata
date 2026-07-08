# Director Entry

## Objective
Create a tiny Node module `src/volume.js` exporting `boxVolume(l,w,h)` that returns the product `l*w*h`.

## Scope
- Single file `src/volume.js` added on the assigned change branch.
- No new dependencies.
- No modifications outside `src/`.

## Definition Of Done
- `node -e "require('./src/volume.js').boxVolume(2,3,4)===24 || process.exit(1)"` exits 0.
- The file is committed on the change branch and returned via the operational report.
