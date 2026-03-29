# [Contract] RS-Token Burn Functionality

## Summary
Implemented a burn functionality for RS-Tokens that allows students or the contract owner to destroy tokens, reducing the total supply or removing them from specific wallets.

## Implementation Details

### 🔥 Core Functionality
- **`burn(env, caller, student, token_id, amount)`** - Burns specified amount of RS-Tokens
- **Authorization**: Only contract owner or the student themselves can burn tokens
- **Validation**: Proper amount validation and balance checking
- **Storage Optimization**: Removes balance entry when balance reaches zero

### 📢 Event Emission
- **Burned Event**: Emitted on successful burn operations with:
  - `burner`: Address that initiated the burn
  - `student`: Address whose tokens were burned
  - `token_id`: ID of the token type burned
  - `amount`: Amount of tokens burned

### 🛡️ Error Handling
- `InsufficientBalance`: When trying to burn more tokens than available
- `NotAuthorized`: When unauthorized users attempt to burn tokens
- `InvalidAmount`: When burn amount is zero or negative

### 🧪 Test Coverage
Added comprehensive test suite covering:
- ✅ Student can burn own tokens
- ✅ Owner can burn student tokens
- ✅ Unauthorized users cannot burn tokens
- ✅ Cannot burn more than balance
- ✅ Cannot burn zero amount
- ✅ Balance entry cleanup when fully burned

## Technical Changes

### New Data Key
- `Owner`: Stores the contract owner address for authorization

### New Error Type
- `InsufficientBalance = 5`: For insufficient balance scenarios

### Event Structure
```rust
env.events().publish(
    ("Burned", "burner", "student", "token_id", "amount"),
    (caller, student, token_id, amount),
);
```

## Usage Examples

### Student Burning Own Tokens
```rust
// Student burns 50 of their own tokens
contract.burn(&student_address, &student_address, &1, &50);
```

### Owner Burning Student Tokens
```rust
// Owner burns 30 tokens from student's balance
contract.burn(&owner_address, &student_address, &1, &30);
```

## Security Considerations
- Proper authorization checks prevent unauthorized token burning
- Balance validation prevents underflow scenarios
- Event emission provides transparency for all burn operations
- Storage optimization removes zero-balance entries to save gas

## Testing
All tests pass successfully:
```bash
cargo test token
# 12 tests passed, 0 failed
```

## Level: Intermediate ✅
This implementation provides a secure and efficient burn mechanism suitable for production use.
