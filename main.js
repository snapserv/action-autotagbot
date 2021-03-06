const semver = require('semver');
const core = require('@actions/core');
const {GitHub, context} = require('@actions/github');
const fs = require('fs');

/**
 * Retrieves the latest 100 repository tags from GitHub for the given context.
 * @param {GitHub} git
 * @param {Context} context
 * @returns {Promise<Array<ReposListTagsResponseItem>>}
 */
async function getRepoTags(git, context) {
  try {
    const tags = await git.repos.listTags({...context.repo, per_page: 100});
    return tags.data;
  } catch (e) {
    throw new Error(`could not fetch repository tags: ${e}`);
  }
}

/**
 * Searches for a tag matching a specific pattern, returning null if not found.
 * @param {Array<ReposListTagsResponseItem>} tags
 * @param {RegExp} tagRegExp
 * @returns {Promise<{name: string, sha: string, match: RegExpExecArray}>}
 */
async function searchMatchingTag(tags, tagRegExp) {
  for (const tag of tags) {
    const match = tagRegExp.exec(tag.name.trim().toLowerCase());
    if (match)
      return {
        'name': tag.name,
        'sha': tag.commit.sha,
        'match': match,
      };
  }

  return null;
}

/**
 * Generates a changelog between two given points, to be used as the tag message
 * @param {GitHub} git
 * @param {Context} context
 * @param {string} from
 * @param {string} to
 * @returns {Promise<string>}
 */
async function getTagMessage(git, context, from, to) {
  try {
    if (!from || !to)
      return 'Initial tag';

    const changelog = await git.repos.compareCommits({...context.repo, base: from, head: to});
    if (!changelog.data.commits || changelog.data.commits.length < 1)
      return 'Initial tag';

    let message = '';
    for (let commit of changelog.data.commits) {
      if (commit) {
        message += `\n* ${commit.commit.message}`;
        if (commit.author && commit.author.login)
          message += ` (${commit.author.login})`;
      }
    }
    return message.trim();
  } catch (e) {
    throw new Error(`could not generate changelog: ${e}`);
  }
}

/**
 * Main logic, called whenever this action is being executed
 * @returns {Promise<void>}
 */
async function run() {
  const apiToken = core.getInput('api_token');
  const sourceFile = core.getInput('source_file');
  const tagFormat = core.getInput('tag_format');
  const versionPattern = core.getInput('version_pattern');
  const versionRegExp = new RegExp(versionPattern, 'gm');

  if (!fs.existsSync(sourceFile))
    return core.setFailed(`Could not find source file: ${sourceFile}`);

  const contents = fs.readFileSync(sourceFile);
  const matches = versionRegExp.exec(String(contents));
  if (!matches)
    return core.setFailed(`Could not find version pattern in source file: ${versionPattern}`);
  if (!matches.groups || !matches.groups.version)
    return core.setFailed(`Could not find named capture group 'version' in pattern: ${versionPattern}`);

  const version = matches.groups.version;
  core.setOutput('version', version);
  core.info(`Extracted version from source file: ${version}`);

  if (version === '0' || version === '0.0' || version === '0.0.0')
    return core.info(`Aborting execution as version [${version}] can not be all zeros`);

  const tagPattern = `^${tagFormat}$`
    .replace('{version}', version)
    .replace('{revision}', '(?<revision>[0-9]+)')
    .toLowerCase();
  const tagRegExp = new RegExp(tagPattern);
  core.info(`Searching for existing tag with pattern: ${tagRegExp}`);

  const git = new GitHub(apiToken);
  const tags = await getRepoTags(git, context);
  const matchingTag = await searchMatchingTag(tags, tagRegExp);
  core.info(`Search result for tag pattern: ${matchingTag ? matchingTag.name : 'not-found'}`);

  if (matchingTag && matchingTag.sha === context.sha)
    return core.info(`Aborting execution as tag [${matchingTag.name}] points to current commit [${matchingTag.sha}]`);

  const tagRevision = matchingTag && matchingTag.match && matchingTag.match.groups
    ? parseInt(matchingTag.match.groups.revision) + 1
    : 1;
  const tagName = tagFormat
    .replace('{version}', version)
    .replace('{revision}', tagRevision.toString());
  core.info(`Determined desired tag name: ${tagName}`);

  if (matchingTag && matchingTag.name === tagName)
    return core.info(`Aborting execution as current tag [${matchingTag.name}] matches desired tag`);

  if (!context.sha)
    return core.setFailed(`Can not create new tag as commit SHA is missing in context`);

  const changelogFrom = tags.length >= 1 ? tags[0].name : null;
  const changelogTo = context.sha;
  core.info(`Generating tag message from [${changelogFrom}] to [${changelogTo}]`);

  const tagMessage = await getTagMessage(git, context, changelogFrom, changelogTo);
  core.info(`Generated tag message: ${tagMessage}`);

  core.info(`Creating new tag [${tagName}] at [${context.sha}]...`);
  const tag = await git.git.createTag({
    ...context.repo,
    tag: tagName,
    message: `${tagName}\n\n${tagMessage}`,
    object: context.sha,
    type: 'commit',
  });
  core.info(`Created new tag [${tag.data.tag}] at [${context.sha}]`);

  core.info(`Creating new reference [${tag.data.tag} => ${tag.data.sha}]...`);
  const tagRef = await git.git.createRef({
    ...context.repo,
    ref: `refs/tags/${tag.data.tag}`,
    sha: tag.data.sha,
  });
  core.info(`Created new reference [${tagRef.data.ref}] at [${tagRef.data.url}]`);

  core.info(`Creating new release [${tagName}]...`);
  const parsedVersion = semver.parse(version);
  const release = await git.repos.createRelease({
    ...context.repo,
    name: tagName,
    body: `${tagMessage}`,
    tag_name: tagName,
    draft: false,
    prerelease: !!(parsedVersion && (parsedVersion.major === 0 || parsedVersion.prerelease.length > 0)),
  });
  core.info(`Created new release [${release.data.url}]`);

  core.setOutput('tag_name', tagName);
  core.setOutput('tag_revision', tagRevision);
  core.setOutput('tag_sha', tag.data.sha);
  core.setOutput('tag_uri', tagRef.data.url);
  core.setOutput('release_uri', release.data.url);

  core.info(`Created new tag [${tagName}] for commit [${context.sha}]`);
}

run().catch(err => {
  core.setFailed(err);
});
