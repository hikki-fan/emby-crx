# Emby Crx Server Adapter

English | [简体中文](README.md)

This fork adapts [Nolovenodie/emby-crx](https://github.com/Nolovenodie/emby-crx) to the Emby Server 4.9.5.0 Web dashboard. It keeps the original home banner and library-card presentation while replacing the obsolete `.section0` dependency with semantic `CollectionFolder` section detection.

## Compatibility

- Checked against the `system/dashboard-ui` files shipped in the official Emby Server `4.9.5.0` package.
- Modifies the server-hosted Emby Web UI only.
- Does not modify native TV or mobile clients that bundle their own UI.
- Emby upgrades or Docker container recreation may require reinstalling the adapter.

The installer validates actual dashboard signatures and stops without changing `index.html` when they are missing.

## Docker installation

```sh
git clone https://github.com/hikki-fan/emby-crx.git
cd emby-crx
git switch codex/emby-4.9.5-server
sh server/docker-install.sh EmbyServer /system/dashboard-ui
docker restart EmbyServer
```

Then hard-refresh the Emby Web page.
The Docker wrappers use container user `0` by default because `/system` is
normally read-only to the Emby service account. Override it with the
`EMBY_CRX_DOCKER_USER` environment variable when required by a custom image.

## Configuration

The first installation creates:

```text
/system/dashboard-ui/emby-crx/config.js
```

Reinstalling preserves this file. The current defaults are copied to `config.default.js`.

## Uninstall

```sh
sh server/docker-uninstall.sh EmbyServer /system/dashboard-ui
docker restart EmbyServer
```

The installer keeps an emergency backup at:

```text
/system/dashboard-ui/index.html.emby-crx.backup
```

To restore the exact pre-installation `index.html` in Docker:

```sh
sh server/docker-uninstall.sh EmbyServer /system/dashboard-ui --restore-backup
docker restart EmbyServer
```

## Tests

```sh
npm run check
npm test
sh tests/server-install.sh
```

See the [Chinese README](README.md) for configuration fields and detailed troubleshooting.

If Emby reports access denied for `/dashboard-ui/index.html` after an older
installation, restore the readable mode and restart:

```sh
sudo docker exec -u 0 emby chmod 644 /system/dashboard-ui/index.html
sudo docker restart emby
```

The current installer preserves the original file owner and mode.

## License

This fork retains the upstream [MIT License](LICENSE). The original visual design and implementation belong to the upstream author.
