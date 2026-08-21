/** Production replacement for development-only incident workbench fixtures. */

const disabled = async (): Promise<never> => {
  throw new Error('Incident workbench fixtures are disabled in production');
};

export const fixtureListTasks = disabled;
export const fixtureCreateTask = disabled;
export const fixtureUpdateTask = disabled;
export const fixtureFindSimilar = disabled;
export const fixtureSearchEvents = disabled;
export const fixtureListResponseActions = disabled;
export const fixturePreviewAction = disabled;
export const fixtureExecuteAction = disabled;
export const fixtureGetActivity = disabled;
export const fixtureAddNote = disabled;
