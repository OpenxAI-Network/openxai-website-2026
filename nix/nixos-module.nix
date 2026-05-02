{ pkgs, lib, ... }:
let
  openxai-website = pkgs.callPackage ./package.nix { };
in {
  users.groups.openxai-website = { };
  users.users.openxai-website = {
    isSystemUser = true;
    group = "openxai-website";
  };

  systemd.services.openxai-website = {
    description = "OpenxAI marketing site";
    wantedBy = [ "multi-user.target" ];
    after = [ "network.target" ];
    environment = {
      HOST = "0.0.0.0";
      PORT = "8080";
      NODE_ENV = "production";
    };
    serviceConfig = {
      ExecStart = "${lib.getExe openxai-website}";
      User = "openxai-website";
      Group = "openxai-website";
      Restart = "on-failure";
      RestartSec = "5s";
    };
  };

  networking.firewall.allowedTCPPorts = [ 8080 ];
}
