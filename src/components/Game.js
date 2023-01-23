import React, { useEffect, useState } from 'react'
import PACK_OF_CARDS from '../utils/packOfCards'
import shuffleArray from '../utils/shuffleArray'
import io from 'socket.io-client'
import queryString from 'query-string'
import Spinner from './Spinner'
import useSound from 'use-sound'
const { Machine } = require('xstate')

let socket
const ENDPOINT = ''

const Game = (props) => {
    const data = queryString.parse(props.location.search)

    const [room, setRoom] = useState(data.roomCode)
    const [roomFull, setRoomFull] = useState(false)
    const [users, setUsers] = useState([])
    const [currentUser, setCurrentUser] = useState('')
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState([])

    const [isChatBoxHidden, setChatBoxHidden] = useState(true)

    useEffect(() => {
        const connectionOptions =  {
            "forceNew" : true,
            "reconnectionAttempts": "Infinity", 
            "timeout" : 10000,                  
            "transports" : ["websocket"]
        }
        socket = io.connect(ENDPOINT, connectionOptions)

        socket.emit('join', {room: room}, (error) => {
            if(error)
                setRoomFull(true)
        })

        //cleanup on component unmount
        return function cleanup() {
            socket.emit('disconnect')
            //shut down connnection instance
            socket.off()
        }
    }, [])

    const [gameOver, setGameOver] = useState(true)
    const [winner, setWinner] = useState('')
    const [player1Deck, setPlayer1Deck] = useState([])
    const [player2Deck, setPlayer2Deck] = useState([])
    const [turn, setTurn] = useState('')
    const [drawCardPile, setDrawCardPile] = useState([])
    const [currentSuit, setCurrentSuit] = useState('')
    const [currentNumber, setCurrentNumber] = useState('')

    const CARDS = [
        'AC', 'AS', 'AH', 'AD', '2C', '2S', '2H', '2D', '3C', '3S', '3H', '3D', '4C', '4S', '4H', '4D', '5C', '5S', '5H', '5D', '6C', '6S', '6H', '6D', '7C', '7S', '7H', '7D', '8C', '8S', '8H', '8D', '9C', '9S', '9H', '9D', 'TC', 'TS', 'TH', 'TD', 'JC', 'JS', 'JH', 'JD', 'QC', 'QS', 'QH', 'QD', 'KC', 'KS', 'KH', 'KD'
    ]

    useEffect(() => {
        const shuffledCards = shuffleArray(PACK_OF_CARDS)
        const player1deck = shuffledCards.splice(0, 8)
        const player2deck = shuffledCards.splice(0, 8)
        let startingCardIndex
        const playedCardsPile = shuffledCards.splice(startingCardIndex, 1)
        const drawCardPile = shuffledCards
        
        socket.emit('initGameState', {
            gameOver: false,
            turn: 'Player 1',
            player1Deck: [...player1Deck],
            player2Deck: [...player2Deck],
            currentColor: playedCardsPile[0].charAt(1),
            currentNumber: playedCardsPile[0].charAt(0),
            playedCardsPile: [...playedCardsPile],
            drawCardPile: [...drawCardPile]
        })
    }, [])

    useEffect(() => {
        socket.on('initGameState', ({ gameOver, turn, player1Deck, player2Deck, currentColor, currentNumber, playedCardsPile, drawCardPile }) => {
            setGameOver(gameOver)
            setTurn(turn)
            setPlayer1Deck(player1Deck)
            setPlayer2Deck(player2Deck)
            setCurrentSuit(currentSuit)
            setCurrentNumber(currentNumber)
            setDrawCardPile(drawCardPile)
        })

        socket.on('updateGameState', ({ gameOver, winner, turn, player1Deck, player2Deck, currentColor, currentNumber, playedCardsPile, drawCardPile }) => {
            gameOver && setGameOver(gameOver)
            winner && setWinner(winner)
            turn && setTurn(turn)
            player1Deck && setPlayer1Deck(player1Deck)
            player2Deck && setPlayer2Deck(player2Deck)
            currentSuit && setCurrentSuit(currentSuit)
            currentNumber && setCurrentNumber(currentNumber)
            drawCardPile && setDrawCardPile(drawCardPile)
        })

        socket.on("roomData", ({ users }) => {
            setUsers(users)
        })

        socket.on('currentUserData', ({ name }) => {
            setCurrentUser(name)
        })

        socket.on('message', message => {
            setMessages(messages => [ ...messages, message ])

            const chatBody = document.querySelector('.chat-body')
            chatBody.scrollTop = chatBody.scrollHeight
        })
    }, [])

    const checkGameOver = (arr) => {
        return arr.length === 1
    }
    
    const checkWinner = (arr, player) => {
        return arr.length === 1 ? player : ''
    }

    const toggleChatBox = () => {
        const chatBody = document.querySelector('.chat-body')
        if(isChatBoxHidden) {
            chatBody.style.display = 'block'
            setChatBoxHidden(false)
        }
        else {
            chatBody.style.display = 'none'
            setChatBoxHidden(true)
        }
    }

    const sendMessage= (event) => {
        event.preventDefault()
        if(message) {
            socket.emit('sendMessage', { message: message }, () => {
                setMessage('')
            })
        }
    }

    const sendStateToServer = (state) => {
        if (prevState != state) {
            socket.emit('updateGameState', state)
            setPrevState(state)
        }
    }


    const crazyEightsMachine = Machine({
      id: 'crazyEights',
      initial: 'start',
      context: {
        player1Deck,
        player2Deck,
        turn,
        drawCardPile,
        currentSuit,
        currentNumber,
        gameOver,
        winner,
        packOfCards: PACK_OF_CARDS,
        playedCards: [],
        drawCount: 0,
        chosenSuit: ''
      },
      states: {
        start: {
          on: {
            START: {
                target: 'game',
                actions: ['startGame', (context) => sendStateToServer(context)]
            }
          }
        },
        game: {
          initial: 'drawCard',
          states: {
            drawCard: {
              on: {
                DRAW: {
                    target: 'playCard',
                    actions: ['drawCard', (context) => sendStateToServer(context)]
                }
              }
            },
            playCard: {
              on: {
                PLAY: [
                    {
                        target: 'checkCard',
                        cond: (context, event) => {
                            let multipleCards = event.cards
                            let isValid = true
                            multipleCards.map(card => {
                                if(!card.startsWith(context.currentNumber) && !card.endsWith(context.currentSuit) && !card.endsWith('8')) {
                                    isValid = false
                                }
                            })
                            return multipleCards.length > 1 && isValid
                        }
                    },
                    {
                        target: 'checkCard',
                        cond: (context, event) => {
                            const playedCard = event.card
                            return playedCard.startsWith(context.currentNumber) || playedCard.endsWith(context.currentSuit) || playedCard.endsWith('8')
                        }
                    },
                    {
                        target: 'drawMoreCards',
                        cond: (context, event) => {
                            return !context.player1Deck.find(card.startsWith(context.currentNumber) || card.endsWith(context.currentSuit) || card.endsWith('8'))
                        }
                    },
                    {
                        target: 'chooseSuit',
                        cond: (context, event) => {
                            return event.card.endsWith('8')
                        }
                    },
                    {
                        target: 'illegalCard'
                    }
                ]
              }
            },
            chooseSuit: {
                on: {
                    SUIT: 'checkCard'
                }
            },
            checkCard: {
              on: {
                LEGAL: 'nextTurn',
                ILLEGAL: 'drawCard'
              }
            },
            drawMoreCards: {
                on: {
                    DRAW: [
                        {
                            target: 'playCard',
                            cond: (context) => {
                                context.drawCount++
                                if (context.drawCount >= 3) {
                                    return 'passTurn'
                                }
                                return 'playCard'
                            }
                        }
                    ]
                }
            },
            passTurn: {
                on: {
                    PASS: 'nextTurn'
                }
            },
            nextTurn: {
              on: {
                END: 'gameOver',
                WIN: {
                    target: 'gameOver', 
                    actions: ['updateWinner']
                }
              }
            },
            illegalCard: {
                on: {
                    DRAW: 'playCard'
                }
            }
          }
        },
        gameOver: {
          type: 'final'
        }
      },
      actions: {
        startGame: (context, event) => {
            context.firstCard = event.card
        },
        updateWinner: (context, event) => {
          if(context.player1deck.length === 0) {
            setWinner('player1');
          } else if (context.player2deck.length === 0) {
            setWinner('player2');
          }
          setGameOver(true);
        },
        chooseSuit: (context, event) => {
            context.chosenSuit = event.suit
        }
      }
    });
    
    


    return (
        <div className={`Game backgroundColorR backgroundColor${currentSuit}`}>
            {(!roomFull) ? <>

                <div className='topInfo'>
                    <h1>Game Code: {room}</h1>
                </div>

                {/* PLAYER LEFT MESSAGES */}
                {users.length===1 && currentUser === 'Player 2' && <h1 className='topInfoText'>Player 1 has left the game.</h1> }
                {users.length===1 && currentUser === 'Player 1' && <h1 className='topInfoText'>Waiting for Player 2 to join the game.</h1> }

                {users.length===2 && <>

                    {gameOver ? <div>{winner !== '' && <><h1>GAME OVER</h1><h2>{winner} wins!</h2></>}</div> :
                    <div>
                        {/* PLAYER 1 VIEW */}
                        {currentUser === 'Player 1' && <>    
                        <div className='player2Deck' style={{pointerEvents: 'none'}}>
                            <p className='playerDeckText'>Player 2</p>
                            {player2Deck.map((item, i) => (
                                <img
                                    key={i}
                                    className='Card'
                                    onClick={() => crazyEightsMachine(item)}
                                    src={require(`../assets/card-back.png`).default}
                                    />
                            ))}
                            {turn==='Player 2' && <Spinner />}
                        </div>
                        <br />
                        <div className='middleInfo' style={turn === 'Player 2' ? {pointerEvents: 'none'} : null}>
                            <button className='game-button' disabled={turn !== 'Player 1'} onClick={crazyEightsMachine}>DRAW CARD</button>
                        </div>
                        <br />
                        <div className='player1Deck' style={turn === 'Player 1' ? null : {pointerEvents: 'none'}}>
                            <p className='playerDeckText'>Player 1</p>
                            {player1Deck.map((item, i) => (
                                <img
                                    key={i}
                                    className='Card'
                                    onClick={() => crazyEightsMachine(item)}
                                    src={require(`../assets/cards-front/${item}.png`).default}
                                    />
                            ))}
                        </div>

                        <div className="chatBoxWrapper">
                            <div className="chat-box chat-box-player1">
                                <div className="chat-head">
                                    <h2>Chat Box</h2>
                                    {!isChatBoxHidden ?
                                    <span onClick={toggleChatBox} class="material-icons">keyboard_arrow_down</span> :
                                    <span onClick={toggleChatBox} class="material-icons">keyboard_arrow_up</span>}
                                </div>
                                <div className="chat-body">
                                    <div className="msg-insert">
                                        {messages.map(msg => {
                                            if(msg.user === 'Player 2')
                                                return <div className="msg-receive">{msg.text}</div>
                                            if(msg.user === 'Player 1')
                                                return <div className="msg-send">{msg.text}</div>
                                        })}
                                    </div>
                                    <div className="chat-text">
                                        <input type='text' placeholder='Type a message...' value={message} onChange={event => setMessage(event.target.value)} onKeyPress={event => event.key==='Enter' && sendMessage(event)} />
                                    </div>
                                </div>
                            </div>
                        </div> </> }

                        {/* PLAYER 2 VIEW */}
                        {currentUser === 'Player 2' && <>
                        <div className='player1Deck' style={{pointerEvents: 'none'}}>
                            <p className='playerDeckText'>Player 1</p>
                            {player1Deck.map((item, i) => (
                                <img
                                    key={i}
                                    className='Card'
                                    onClick={() => crazyEightsMachine(item)}
                                    src={require(`../assets/card-back.png`).default}
                                    />
                            ))}
                            {turn==='Player 1' && <Spinner />}
                        </div>
                        <br />
                        <div className='middleInfo' style={turn === 'Player 1' ? {pointerEvents: 'none'} : null}>
                            <button className='game-button' disabled={turn !== 'Player 2'} onClick={onCardDrawnHandler}>DRAW CARD</button>
                        </div>
                        <br />
                        <div className='player2Deck' style={turn === 'Player 1' ? {pointerEvents: 'none'} : null}>
                            <p className='playerDeckText'>Player 2</p>
                            {player2Deck.map((item, i) => (
                                <img
                                    key={i}
                                    className='Card'
                                    onClick={() => crazyEightsMachine(item)}
                                    src={require(`../assets/cards-front/${item}.png`).default}
                                    />
                            ))}
                        </div>

                        <div className="chatBoxWrapper">
                            <div className="chat-box chat-box-player2">
                                <div className="chat-head">
                                    <h2>Chat Box</h2>
                                    {!isChatBoxHidden ?
                                    <span onClick={toggleChatBox} class="material-icons">keyboard_arrow_down</span> :
                                    <span onClick={toggleChatBox} class="material-icons">keyboard_arrow_up</span>}
                                </div>
                                <div className="chat-body">
                                    <div className="msg-insert">
                                        {messages.map(msg => {
                                            if(msg.user === 'Player 1')
                                                return <div className="msg-receive">{msg.text}</div>
                                            if(msg.user === 'Player 2')
                                                return <div className="msg-send">{msg.text}</div>
                                        })}
                                    </div>
                                    <div className="chat-text">
                                        <input type='text' placeholder='Type a message...' value={message} onChange={event => setMessage(event.target.value)} onKeyPress={event => event.key==='Enter' && sendMessage(event)} />
                                    </div>
                                </div>
                            </div>
                        </div> </> }
                    </div> }
                </> }
            </> : <h1>Room full</h1> }

            <br />
            <a href='/'><button className="game-button red">QUIT</button></a>
        </div>
    )
}

export default Game