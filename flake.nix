{
  description = "openxai-website-2026 — openxai.org marketing site";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs = { self, nixpkgs, systems }:
    let
      eachSystem = f:
        nixpkgs.lib.genAttrs (import systems) (system:
          f { inherit system; pkgs = nixpkgs.legacyPackages.${system}; });
    in {
      packages = eachSystem ({ pkgs, ... }: {
        default = pkgs.callPackage ./nix/package.nix { };
      });
      nixosModules.default = { ... }: {
        imports = [ ./nix/nixos-module.nix ];
      };
    };
}
