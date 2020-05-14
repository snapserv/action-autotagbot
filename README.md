# TagBot :label:

[![Latest Release](https://img.shields.io/github/v/release/snapserv/action-tagbot)](https://github.com/snapserv/action-tagbot/releases)
[![License](https://img.shields.io/github/license/snapserv/action-tagbot)](https://github.com/snapserv/action-tagbot/blob/master/LICENSE)

This action will read a specified source file and attempts to extract
the current version with a customizable regular expression pattern.
After extracting the current version, TagBot will verify that a Git
tag/release with a specified pattern exists for the current version.

If no tag/release was found, TagBot automatically creates a new one and
generates a changelog by listing all commits since the previous tags.

## Usage

The following snippet is an example GitHub workflow (e.g.
`.github/workflows/tagbot.yml`), which will automatically create tags
whenever a `push` to `master` happens and the version in `package.json`
has been changed:

```yaml
name: TagBot

on:
  push:
    branches:
    - master
    paths:
    # This would not be necessary, as TagBot skips already tagged releases
    # It is however desirable to not trigger this workflow if not required
    - package.json

jobs:
  tagbot:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v2

      - name: Release new versions using TagBot
        uses: snapserv/action-tagbot@v1.0.0
        with:
            api_token: '${{ secrets.GITHUB_TOKEN }}'
            source_file: 'package.json'
            version_pattern: '"version"\s*:\s*"(?<version>[0-9.]+)"'
```

Please make sure to use `actions/checkout` before this action, as
otherwise TagBot is unable to read the source file for extracting the
current version number.

## Configuration

### Mandatory

You must specify the input parameters `api_token`, `source_file` and
`version_pattern` to use this action, as otherwise TagBot is unable to
determine how to behave correctly.

- `api_token`: This parameters specifies the token for accessing the
  GitHub API. You can normally pass `secrets.GITHUB_TOKEN` to this
  parameter and let GitHub handle all the required shenanigans.
- `source_file`: This parameter specifies the path to the source file
  from which the version should be extracted and is relative to the
  repository root.
- `version_pattern`: This parameter specifies a regular expression
  pattern for extracting the current version from the specified source
  file. Any valid JavaScript regular expression can be specified, as
  long as it will put the current version into a named capture group
  called `version`.

Putting all these parameters together, the final action configuration in
your workflow might look like this:

```yaml
- uses: snapserv/action-tagbot@v1.0.0
  with:
    api_token: '${{ secrets.GITHUB_TOKEN }}'
    source_file: 'package.json'
    version_pattern: '"version"\s*:\s*"(?<version>[0-9.]+)"'
```

### Optional

There is currently a single optional parameter `tag_format`, which can
be adjusted to customize how the tags are being named after extracting
the version from the source file. By default, this parameter defaults to
`{version}`, resulting in using the extracted version without any
further modifications as the desired tag name.

This allows to add a prefix and/or suffix to your tag, e.g. if you want
to prepend `v` to all your tags, you can change this parameter to
`v{version}`. This tag also supports various replacement patterns:

- `{version}`: This pattern gets replaced by the version extracted from
  the specified source file.
- `{revision}`: This value defaults to 1 and is usually not included by
  default. If the current commit was tagged before with the same
  version, TagBot tries to detect if the previous version tag had a
  revision number. If so, it is automatically incremented by one for
  this commit.

The replacement pattern `{revision}` can be used for managing Docker
images of foreign / upstream software in a clever way. Should you want
to create a `nginx` image, you might always want to tag your image with
the same version as upstream. This however makes it impossible to track
different image versions of the same upstream version, which is where
`{revision}` can help. By changing the `tag_format` to
`{version}-{revision}`, this behaviour can be achieved:

- Version is initialized with `1.0.0`, TagBot creates a new tag called
  `1.0.0-1`
- Changes are pushed to master without increasing the version number,
  causing TagBot to create a new tag as `1.0.0-2`
- More changes are pushed to master, again without increasing the
  version number, resulting in another tag `1.0.0-3`
- Further changes are pushed to master, this time while increasing the
  version to `1.0.1`. TagBot will reset the revision to `1` and create a
  new tag called `1.0.1-1`.

## Output

This action produces several outputs which can be used for further
processing in a different GitHub action:

- `version` contains the extracted version from the source file
- `tag_name` contains the name of the created tag, otherwise empty
- `tag_sha` contains the SHA of the created tag, otherwise empty
- `tag_revision` contains the revision of the created tag, otherwise
  empty
- `tag_uri` contains the URL to the revision of the created tag,
  otherwise empty

