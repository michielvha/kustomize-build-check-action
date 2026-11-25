# kustomize-build-check-action

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A GitHub Action that runs `kustomize build` on the Kustomize overlays a change affects. A change to a
base builds every overlay that uses it. A change to an overlay builds only that overlay. Helm charts
are inflated by default.

## Usage

Copy one of the example workflows into `.github/workflows/`:

- [basic](examples/basic/kustomize-build-check.yml) checks every pull request.
- [custom-base-ref](examples/custom-base-ref/kustomize-build-check.yml) compares against the pull request's base commit.
- [continue-on-error](examples/continue-on-error/kustomize-build-check.yml) keeps the job green and posts the counts as a pull request comment.
- [monorepo](examples/monorepo/kustomize-build-check.yml) runs one job per changed project directory.
- [with-kubeconform](examples/with-kubeconform/kustomize-build-check.yml) validates the built manifests against Kubernetes schemas afterwards.

[action.yml](action.yml) lists the inputs and outputs with their defaults.

Check out with `fetch-depth: 0` so the base commit is available. When the action cannot resolve the
base ref, for example in a shallow clone, it builds every kustomization it finds. Set
`on-unresolvable-base: fail` to stop instead.

When `base-ref` is empty, the action compares against `HEAD~1`, which covers only the last commit. Set
it to `${{ github.event.pull_request.base.sha }}` to check the whole pull request.

## What gets built

The action finds every `kustomization.yaml`, `kustomization.yml` and `Kustomization` file under
`root-dir` and records which ones reference which. For each changed file:

- A changed kustomization file marks its own directory.
- Any other changed file marks each kustomization that references it, for example as a resource, a
  patch, a generator input or a Helm values file.

Every marked kustomization is built, along with everything that depends on it. A changed file that
no kustomization references builds nothing. A kustomization the action cannot fully parse is built
on every run.

```mermaid
flowchart TD
    A[Changed file<br/>base/common/deployment.yaml]
    B{Detect references<br/>via dependency graph}
    C1[overlays/dev]
    C2[overlays/staging]
    C3[overlays/prod]
    D[kustomize build --enable-helm<br/>runs for impacted overlays]

    A --> B
    B --> C1
    B --> C2
    B --> C3
    C1 --> D
    C2 --> D
    C3 --> D
```

Some paths are skipped and counted in `skipped-count`: directories the change deleted or renamed, and
kustomize Components, which only build through a parent. A directory that still exists but no longer
builds is a failure. So is a build that runs longer than `build-timeout`.

## How it runs

The action runs a prebuilt image from `ghcr.io/michielvha/kustomize-build-check`, pinned by commit SHA
in [action.yml](action.yml). It needs no token. The source, design documents and issue tracker are in
[kustomize-build-check](https://github.com/michielvha/kustomize-build-check).

## Development and releases

`bun test` checks that every example uses the action and passes only the inputs and reads only the
outputs that [action.yml](action.yml) declares. CI also runs the action against
[tests/fixture](tests/fixture/) and expects two successful builds and one failure.

A push to `main` releases through the shared
[gh-release-workflow](https://github.com/vhco-pro/gh-release-workflow), after those tests pass.
GitVersion picks the next version from the Conventional Commit messages and tags it `vX.Y.Z`. Pin a
release by its commit SHA with the tag as a comment, for example
`uses: michielvha/kustomize-build-check-action@<commit sha> # vX.Y.Z`.
