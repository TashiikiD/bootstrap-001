# Run AIES on Pi

Use the root wrapper so Pi starts with `E:\Coding\AIESv2` as the working directory and picks up the AIES root overlay.

## Interactive

```powershell
.\run-aies-on-pi.ps1
```

## Wrapper smoke test

```powershell
.\run-aies-on-pi.ps1 --help
```

## After model configuration

Once a provider/model is configured, start Pi from the AIES root and confirm:
- interactive startup shows the AIES bootstrap status/widget
- `/aies-paths` is available
- `/aies-status` is available
