// src/labs/game-2048/page.tsx

import { useEffect, useMemo, useReducer } from 'react';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Space, Statistic, Tag } from 'antd';

import { PageHeader } from '@/shared/ui/page-header';

import { game2048LabMeta } from './meta';

import './page.css';

const BOARD_SIZE = 4;
const INITIAL_TILE_COUNT = 2;
const TARGET_TILE = 2048;

type Board = number[];
type Direction = 'down' | 'left' | 'right' | 'up';

type MoveResult = {
  board: Board;
  changed: boolean;
  gainedScore: number;
};

type GameState = {
  bestScore: number;
  board: Board;
  moves: number;
  score: number;
};

type GameAction = { direction: Direction; type: 'move' } | { type: 'restart' };

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => 0);
}

function getEmptyCellIndexes(board: Board) {
  return board.flatMap((value, index) => (value === 0 ? [index] : []));
}

function addRandomTile(board: Board): Board {
  const emptyCellIndexes = getEmptyCellIndexes(board);

  if (emptyCellIndexes.length === 0) {
    return board;
  }

  const nextBoard = [...board];
  const targetIndex = emptyCellIndexes[Math.floor(Math.random() * emptyCellIndexes.length)];
  nextBoard[targetIndex] = Math.random() < 0.9 ? 2 : 4;

  return nextBoard;
}

function createInitialBoard(): Board {
  let board = createEmptyBoard();

  for (let index = 0; index < INITIAL_TILE_COUNT; index += 1) {
    board = addRandomTile(board);
  }

  return board;
}

function createInitialGameState(bestScore = 0): GameState {
  return {
    bestScore,
    board: createInitialBoard(),
    moves: 0,
    score: 0,
  };
}

function compactLine(line: number[]) {
  const values = line.filter((value) => value > 0);
  const nextLine: number[] = [];
  let gainedScore = 0;

  for (let index = 0; index < values.length; index += 1) {
    const currentValue = values[index];
    const nextValue = values[index + 1];

    if (currentValue === nextValue) {
      const mergedValue = currentValue * 2;
      nextLine.push(mergedValue);
      gainedScore += mergedValue;
      index += 1;
    } else {
      nextLine.push(currentValue);
    }
  }

  while (nextLine.length < BOARD_SIZE) {
    nextLine.push(0);
  }

  return { gainedScore, line: nextLine };
}

function getLine(board: Board, lineIndex: number, direction: Direction) {
  return Array.from({ length: BOARD_SIZE }, (_, cellIndex) => {
    if (direction === 'left' || direction === 'right') {
      return board[lineIndex * BOARD_SIZE + cellIndex];
    }

    return board[cellIndex * BOARD_SIZE + lineIndex];
  });
}

function setLine(board: Board, lineIndex: number, direction: Direction, line: number[]) {
  line.forEach((value, cellIndex) => {
    if (direction === 'left' || direction === 'right') {
      board[lineIndex * BOARD_SIZE + cellIndex] = value;
      return;
    }

    board[cellIndex * BOARD_SIZE + lineIndex] = value;
  });
}

function moveBoard(board: Board, direction: Direction): MoveResult {
  const nextBoard = [...board];
  let gainedScore = 0;

  for (let lineIndex = 0; lineIndex < BOARD_SIZE; lineIndex += 1) {
    const sourceLine = getLine(board, lineIndex, direction);
    const shouldReverse = direction === 'down' || direction === 'right';
    const compactSource = shouldReverse ? [...sourceLine].reverse() : sourceLine;
    const compacted = compactLine(compactSource);
    const targetLine = shouldReverse ? compacted.line.reverse() : compacted.line;

    gainedScore += compacted.gainedScore;
    setLine(nextBoard, lineIndex, direction, targetLine);
  }

  return {
    board: nextBoard,
    changed: nextBoard.some((value, index) => value !== board[index]),
    gainedScore,
  };
}

function canMove(board: Board) {
  if (getEmptyCellIndexes(board).length > 0) {
    return true;
  }

  return (['up', 'right', 'down', 'left'] as Direction[]).some(
    (direction) => moveBoard(board, direction).changed,
  );
}

function getTileTone(value: number) {
  if (value === 0) {
    return 'empty';
  }

  return String(Math.min(Math.log2(value), 11));
}

const keyboardDirectionMap: Record<string, Direction | undefined> = {
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
};

function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'restart') {
    return createInitialGameState(state.bestScore);
  }

  if (!canMove(state.board)) {
    return state;
  }

  const result = moveBoard(state.board, action.direction);

  if (!result.changed) {
    return state;
  }

  const nextScore = state.score + result.gainedScore;

  return {
    bestScore: Math.max(state.bestScore, nextScore),
    board: addRandomTile(result.board),
    moves: state.moves + 1,
    score: nextScore,
  };
}

export function Game2048LabPage() {
  const [{ bestScore, board, moves, score }, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialGameState(),
  );

  const reachedTarget = board.some((value) => value >= TARGET_TILE);
  const gameOver = !canMove(board);
  const maxTile = useMemo(() => Math.max(...board), [board]);

  function restartGame() {
    dispatch({ type: 'restart' });
  }

  function move(direction: Direction) {
    dispatch({ direction, type: 'move' });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const direction = keyboardDirectionMap[event.key];

      if (!direction) {
        return;
      }

      event.preventDefault();
      dispatch({ direction, type: 'move' });
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        description={game2048LabMeta.description}
        extra={
          <Space>
            <Tag>Lab</Tag>
            <Tag>dev/test</Tag>
          </Space>
        }
        title={game2048LabMeta.name}
      />

      <Alert
        showIcon
        title="方向键、WASD 或按钮都可以移动方块；状态只保存在当前页面。"
        type={gameOver ? 'warning' : reachedTarget ? 'success' : 'info'}
      />

      <div className="game2048-layout">
        <Card
          extra={
            <Button icon={<ReloadOutlined />} onClick={restartGame}>
              重开
            </Button>
          }
          title="2048"
        >
          <div className="game2048-board" role="grid" aria-label="2048 棋盘">
            {board.map((value, index) => (
              <div
                key={`${index}-${value}`}
                aria-label={value === 0 ? '空格' : String(value)}
                className={`game2048-tile game2048-tile-tone-${getTileTone(value)}${
                  value >= 1024 ? ' game2048-tile-large' : ''
                }`}
                role="gridcell"
              >
                {value > 0 ? value : null}
              </div>
            ))}
          </div>
        </Card>

        <div className="game2048-side">
          <Card title="状态">
            <div className="game2048-stat-grid">
              <Statistic title="分数" value={score} />
              <Statistic title="最佳" value={bestScore} />
              <Statistic title="步数" value={moves} />
              <Statistic title="最大方块" value={maxTile} />
            </div>
          </Card>

          <Card title="移动">
            <div className="game2048-control-pad" aria-label="移动控制">
              <div />
              <Button
                aria-label="上移"
                disabled={gameOver}
                icon={<ArrowUpOutlined />}
                onClick={() => move('up')}
              />
              <div />
              <Button
                aria-label="左移"
                disabled={gameOver}
                icon={<ArrowLeftOutlined />}
                onClick={() => move('left')}
              />
              <Button
                aria-label="下移"
                disabled={gameOver}
                icon={<ArrowDownOutlined />}
                onClick={() => move('down')}
              />
              <Button
                aria-label="右移"
                disabled={gameOver}
                icon={<ArrowRightOutlined />}
                onClick={() => move('right')}
              />
            </div>
          </Card>

          {gameOver || reachedTarget ? (
            <Alert
              showIcon
              title={gameOver ? '没有可移动的格子了。' : '已经合成 2048。'}
              type={gameOver ? 'warning' : 'success'}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
