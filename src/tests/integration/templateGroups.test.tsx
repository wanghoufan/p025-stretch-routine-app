import { screen } from '@testing-library/react-native';
import { runSeeds } from '../../data/seeds';
import { renderApp } from '../support/renderApp';
import { createTestContext } from '../support/testContext';
import { createTestSpeaker } from '../support/fixtures';

/**
 * TASK-014 B-3 acceptance at the UI level, restated for TASK-021-F2: Home now
 * groups the shipped templates by **training type** (the same axis the
 * statistics page counts by) instead of by a scene guessed from `category`,
 * and the CORE templates still carry a difficulty badge.
 */
describe('首页按训练类型分组 (TASK-021-F2)', () => {
  it('首页按训练类型分组，核心模板带难度角标', async () => {
    const context = await createTestContext();
    await runSeeds({
      db: context.db,
      clock: context.clock,
      generateId: context.services.generateId,
    });

    renderApp({ services: context.services, speaker: createTestSpeaker() });
    expect(await screen.findByText('共 9 个流程')).toBeTruthy();

    expect(screen.getByTestId('routine-group-STRETCH_RELAX')).toBeTruthy();
    expect(screen.getByTestId('routine-group-WARMUP')).toBeTruthy();
    expect(screen.getByTestId('routine-group-CORE')).toBeTruthy();
    // 旧的两个凭空分组名不再出现。
    expect(screen.queryByTestId('routine-group-日常拉伸')).toBeNull();
    expect(screen.queryByTestId('routine-group-健身前后')).toBeNull();
    expect(screen.queryByText(/健身前后/)).toBeNull();

    expect(screen.getByText('拉伸放松 (5)')).toBeTruthy();
    expect(screen.getByText('热身 (1)')).toBeTruthy();
    expect(screen.getByText('核心训练 (3)')).toBeTruthy();

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
