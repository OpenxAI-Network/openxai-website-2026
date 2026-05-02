{ pkgs, lib, ... }:
pkgs.buildNpmPackage {
  pname = "openxai-website-2026";
  version = "0.1.0";
  src = ../astro-app;

  npmDeps = pkgs.importNpmLock {
    npmRoot = ../astro-app;
  };
  npmConfigHook = pkgs.importNpmLock.npmConfigHook;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/{share/openxai-website,bin}
    cp -rL dist          $out/share/openxai-website/dist
    cp -rL node_modules  $out/share/openxai-website/node_modules
    cp     package.json  $out/share/openxai-website/package.json
    makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/openxai-website \
      --add-flags "$out/share/openxai-website/dist/server/entry.mjs" \
      --set-default PORT 3000 \
      --set-default HOST 0.0.0.0
    runHook postInstall
  '';

  doDist = false;
  meta.mainProgram = "openxai-website";
}
