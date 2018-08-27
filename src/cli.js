#!/usr/bin/env node
const Promise = require('bluebird');
const _ = require('lodash');
const git = require('simple-git/promise');

const repo = git('.');

// Maximum time diff between 2 subsequent commits in minutes which are
// counted to be in the same coding "session"
const maxCommitDiffInMinutes = 120;

// How many minutes should be added for the first commit of coding session
const firstCommitAdditionInMinutes = 120;

const allBranches = async () => {
  const branchesSummary = await repo.branchLocal();
  return branchesSummary.all;
};

const branchesCommits = async (branches) => {
  const rawCommits = await Promise.reduce(branches, async (acc, branch) => {
    const commitsList = await repo.log([branch]);
    return acc.concat(commitsList.all);
  }, []);

  return _.uniq(rawCommits, commit => commit.hash);
};

const groupCommitsByAuthor = commits => (
  _.groupBy(commits, commit => (commit.author_email || 'unknown'))
);

const estimateHours = (dates) => {
  if (dates.length < 2) return 0;

  // Oldest commit first, newest last
  const sortedDates = dates.sort((a, b) => (new Date(a) - new Date(b)));

  const allButLast = sortedDates.slice(0, -1);

  const totalHours = _.reduce(allButLast, (accHours, currentDate, index) => {
    const nextDate = sortedDates[index + 1];
    const diffInMinutes = (new Date(nextDate) - new Date(currentDate)) / 1000 / 60;

    // Check if commits are counted to be in same coding session
    if (diffInMinutes < maxCommitDiffInMinutes) {
      return accHours + (diffInMinutes / 60);
    }

    // The date difference is too big to be inside single coding session
    // The work of first commit of a session cannot be seen in git history,
    // so we make a blunt estimate of it
    return accHours + (firstCommitAdditionInMinutes / 60);
  }, 0);

  return Math.round(totalHours);
};

const processAuthorsWorks = commits => (
  _.map(commits, (authorCommits, authorEmail) => {
    const dates = _.map(authorCommits, 'date');
    return {
      email: authorEmail,
      hours: estimateHours(dates),
      commits: authorCommits.length,
    };
  })
);

const calculateTotalWorks = works => (
  works.reduce((acc, work) => {
    const hours = acc.hours + work.hours;
    const commits = acc.commits + work.commits;
    return { hours, commits };
  }, { hours: 0, commits: 0 })
);

(async () => {
  const isRepo = await repo.checkIsRepo();
  if (!isRepo) {
    throw new Error('current folder has no initialized git repository');
  }

  const branches = await allBranches();

  const allCommits = await branchesCommits(branches);

  const authorsCommits = groupCommitsByAuthor(allCommits);

  const authorWorks = processAuthorsWorks(authorsCommits);

  const totalWorks = calculateTotalWorks(authorWorks);

  console.warn(totalWorks);
})();
