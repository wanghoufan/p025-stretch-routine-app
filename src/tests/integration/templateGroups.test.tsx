import { screen } from '@testing-library/react-native';
import { runSeeds } from '../../data/seeds';
import { renderApp } from '../support/renderApp';
import { createTestContext } from '../support/testContext';
import { createTestSpeaker } from '../support/fixtures';

/**
 * TASK-014 B-3 acceptance at the UI level: Home groups the shipped templates
 * into four scenes and the 核心 templates carry a difficulty badge.
 */
describe('流程模板场景分组 (TASK-014)', () => {
  it('首页按场景分组，核心模板带难度角标', async () => {
    const context = await createTestContext();
    await runSeeds({
      db: context.db,
      clock: context.clock,
      generateId: context.services.generateId,
    });

    renderApp({ services: context.services, speaker: createTestSpeaker() });
    expect(await screen.findByText('共 9 个流程')).toBeTruthy();

    expect(screen.getByTestId('routine-group-日常拉伸')).toBeTruthy();
    expect(screen.getByTestId('routine-group-健身前后')).toBeTruthy();
    expect(screen.getByTestId('routine-group-热身')).toBeTruthy();
    expect(screen.getByTestId('routine-group-核心')).toBeTruthy();

    expect(screen.getByText('日常拉伸 (2)')).toBeTruthy();
    expect(screen.getByText('健身前后 (3)')).toBeTruthy();
    expect(screen.getByText('热身 (1)')).toBeTruthy();
    expect(screen.getByText('核心 (3)')).toBeTruthy();

    expect(screen.getByText('晨起全身拉伸')).toBeTruthy();
    expect(screen.getByText('睡前全身放松')).toBeTruthy();
    expect(screen.getByText('跑后下肢放松')).toBeTruthy();
    expect(screen.getByText('办公室久坐放松')).toBeTruthy();
    expect(screen.getByText('久坐办公族拉伸')).toBeTruthy();
    expect(screen.getByText('5分钟快速热身')).toBeTruthy();
    expect(screen.getByText('初级核心')).toBeTruthy();

    // Only the three 核心 templates get a badge.
    expect(screen.getAllByTestId(/^routine-badge-/)).toHaveLength(3);
    expect(screen.getAllByText('低')).toHaveLength(1);
    expect(screen.getAllByText('中')).toHaveLength(1);
    expect(screen.getAllByText('高')).toHaveLength(1);

    context.dispose();
  });
});
